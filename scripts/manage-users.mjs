#!/usr/bin/env node
// Add, list and remove dashboard logins.
//
//   node scripts/manage-users.mjs add <username> "Display Name"
//   node scripts/manage-users.mjs passwd <username>     # change password only
//   node scripts/manage-users.mjs list
//   node scripts/manage-users.mjs remove <username>
//
// The prompt is hidden and asks twice. $PASSWORD is honoured for scripting,
// but avoid it interactively — it lands in your shell history.
//
// Passwords are hashed here and only the hash is written to KV — the plain
// password never leaves this machine and is never stored anywhere.
// Writes go straight to KV via wrangler, not through the site, because the
// data endpoint's key allowlist deliberately refuses `auth:users`.
import { execFileSync } from 'node:child_process'
import { webcrypto as crypto } from 'node:crypto'


const KEY = 'auth:users'
const NS = '1bed6e14dbf047ac8616ae21ed09a9f6'
const ITERATIONS = 100_000 // the Workers runtime rejects anything higher

const toHex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, key, 256)
  return { salt: toHex(salt), hash: toHex(bits), iterations: ITERATIONS }
}

const wrangler = (args, input) =>
  execFileSync('npx', ['wrangler', ...args], {
    encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'inherit'],
  })

function readUsers() {
  try {
    const out = wrangler(['kv', 'key', 'get', KEY, '--namespace-id', NS, '--remote'])
    return JSON.parse(out)
  } catch {
    return {}
  }
}

function writeUsers(users) {
  wrangler(['kv', 'key', 'put', KEY, JSON.stringify(users), '--namespace-id', NS, '--remote'])
}

// readline echoes by default, which would print the password to the terminal
// and leave it in the scrollback.
// Read one line from stdin without echoing it.
//
// Done against stdin directly rather than through readline: readline's
// terminal mode never settles when stdin is a pipe, which is how this gets
// tested, and its output hook differs between the callback and promises APIs.
let pipedBuffer = ''

function readHidden(prompt) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin
    process.stdout.write(prompt)

    // Piped input (tests, CI): there is no terminal to echo to, so just read
    // a line. Whatever arrived after that line is kept — a pipe delivers both
    // answers in one chunk, and discarding the tail left the second prompt
    // waiting for data that had already been consumed.
    if (!stdin.isTTY) {
      stdin.setEncoding('utf8')

      const take = () => {
        const nl = pipedBuffer.indexOf('\n')
        if (nl === -1) return null
        const line = pipedBuffer.slice(0, nl).replace(/\r$/, '')
        pipedBuffer = pipedBuffer.slice(nl + 1)
        return line
      }

      const ready = take()
      if (ready !== null) {
        process.stdout.write('\n')
        resolve(ready)
        return
      }

      const onData = (chunk) => {
        pipedBuffer += chunk
        const line = take()
        if (line === null) return
        stdin.off('data', onData)
        stdin.pause()
        process.stdout.write('\n')
        resolve(line)
      }
      stdin.on('data', onData)
      stdin.resume()
      return
    }

    let answer = ''
    stdin.setRawMode(true)
    stdin.setEncoding('utf8')
    stdin.resume()

    const done = (fn, value) => {
      stdin.off('data', onKey)
      stdin.setRawMode(false)
      stdin.pause()
      process.stdout.write('\n')
      fn(value)
    }

    const onKey = (key) => {
      switch (key) {
        case '\r':
        case '\n':
        case '\u0004':
          return done(resolve, answer)
        case '\u0003': // Ctrl-C
          return done(reject, new Error('Cancelled.'))
        case '\u007f': // backspace
        case '\b':
          answer = answer.slice(0, -1)
          return
        default:
          // Ignore escape sequences (arrow keys and friends).
          if (key.charCodeAt(0) < 32) return
          answer += key
      }
    }

    stdin.on('data', onKey)
  })
}

async function newPassword(username) {
  if (process.env.PASSWORD) return process.env.PASSWORD
  const first = await readHidden(`New password for ${username}: `)
  const again = await readHidden('Type it again: ')
  if (first !== again) {
    console.error('They did not match. Nothing was changed.')
    process.exit(65)
  }
  return first
}

const [cmd, username, displayName] = process.argv.slice(2)
const users = readUsers()

if (cmd === 'list') {
  const names = Object.keys(users)
  console.log(names.length ? names.map((u) => `  ${u}  (${users[u].name ?? '—'})`).join('\n') : '  (no users yet)')
} else if (cmd === 'add') {
  if (!username) { console.error('usage: add <username> "Display Name"'); process.exit(64) }
  const password = await newPassword(username)
  // Longer minimum than usual, because the Workers PBKDF2 cap means we cannot
  // buy strength with iterations.
  if (!password || password.length < 12) {
    console.error('Password must be at least 12 characters.'); process.exit(65)
  }
  const key = username.toLowerCase()
  const existing = users[key]
  users[key] = { ...(await hashPassword(password)), name: displayName ?? existing?.name ?? username }
  writeUsers(users)
  console.log(`${existing ? 'Updated' : 'Added'} ${key}. ${Object.keys(users).length} user(s) total.`)
} else if (cmd === 'passwd') {
  const key = String(username ?? '').toLowerCase()
  if (!users[key]) { console.error(`No such user: ${username}`); process.exit(66) }
  const password = await newPassword(key)
  if (!password || password.length < 12) {
    console.error('Password must be at least 12 characters.'); process.exit(65)
  }
  users[key] = { ...(await hashPassword(password)), name: users[key].name }
  writeUsers(users)
  console.log(`Password changed for ${key}. Existing sessions stay valid until they expire.`)
} else if (cmd === 'remove') {
  if (!users[username]) { console.error(`No such user: ${username}`); process.exit(66) }
  delete users[username]
  writeUsers(users)
  console.log(`Removed ${username}. ${Object.keys(users).length} user(s) left.`)
} else {
  console.error('usage: manage-users.mjs <add|passwd|list|remove> [username] ["Display Name"]')
  process.exit(64)
}
