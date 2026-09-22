#!/usr/bin/env node
// Add, list and remove dashboard logins.
//
//   node scripts/manage-users.mjs add <username> "Display Name"
//   node scripts/manage-users.mjs passwd <username>     # change password only
//   node scripts/manage-users.mjs email <username> <address>   # or "" to clear
//   node scripts/manage-users.mjs revoke <username>     # sign them out everywhere
//   node scripts/manage-users.mjs list
//   node scripts/manage-users.mjs remove <username>
//
// An address is what lets someone sign in with an emailed code instead of a
// password. It is optional per person: an account without one can still sign
// in the usual way.
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
  console.log(names.length
    ? names.map((u) => `  ${u.padEnd(14)} ${(users[u].name ?? '—').padEnd(20)} ${(users[u].email ?? '(no email)').padEnd(30)} (session v${users[u].v ?? 1})`).join('\n')
    : '  (no users yet)')
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
  // Bump the session version so a password change also ends sessions that are
  // already signed in — otherwise changing it after a leak achieves nothing.
  // Spread the existing record first: the hash fields are being replaced, but
  // the email is not, and rebuilding the object from scratch silently dropped
  // it — which would have taken away someone's email sign-in every time their
  // password was changed.
  users[key] = {
    ...existing,
    ...(await hashPassword(password)),
    name: displayName ?? existing?.name ?? username,
    v: (existing?.v ?? 0) + 1,
  }
  writeUsers(users)
  console.log(`${existing ? 'Updated' : 'Added'} ${key}. ${Object.keys(users).length} user(s) total.`)
  if (existing) console.log('Any sessions they had are now signed out (within a minute).')
} else if (cmd === 'passwd') {
  const key = String(username ?? '').toLowerCase()
  if (!users[key]) { console.error(`No such user: ${username}`); process.exit(66) }
  const password = await newPassword(key)
  if (!password || password.length < 12) {
    console.error('Password must be at least 12 characters.'); process.exit(65)
  }
  users[key] = {
    ...users[key],
    ...(await hashPassword(password)),
    v: (users[key].v ?? 1) + 1,
  }
  writeUsers(users)
  console.log(`Password changed for ${key}, and every session they had is signed out (within a minute).`)
} else if (cmd === 'email') {
  const key = String(username ?? '').toLowerCase()
  if (!users[key]) { console.error(`No such user: ${username}`); process.exit(66) }
  // displayName is the third positional argument, which for this command is
  // the address.
  const address = String(displayName ?? '').trim().toLowerCase()

  if (address && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
    console.error(`That does not look like an email address: ${address}`); process.exit(65)
  }
  // The gate finds the account by address, so two accounts sharing one would
  // make which of them you signed in as depend on object key order.
  const clash = Object.entries(users)
    .find(([u, r]) => u !== key && String(r.email ?? '').toLowerCase() === address && address)
  if (clash) { console.error(`${clash[0]} already uses ${address}.`); process.exit(65) }

  users[key] = { ...users[key], email: address || undefined }
  if (!address) delete users[key].email
  writeUsers(users)
  console.log(address
    ? `${key} can now sign in with a code sent to ${address}.`
    : `Removed the address from ${key}. They sign in with their password only.`)

} else if (cmd === 'revoke') {
  const key = String(username ?? '').toLowerCase()
  if (!users[key]) { console.error(`No such user: ${username}`); process.exit(66) }
  users[key] = { ...users[key], v: (users[key].v ?? 1) + 1 }
  writeUsers(users)
  console.log(`Signed ${key} out everywhere (within a minute). Their password still works.`)
} else if (cmd === 'remove') {
  if (!users[username]) { console.error(`No such user: ${username}`); process.exit(66) }
  delete users[username]
  writeUsers(users)
  console.log(`Removed ${username}. ${Object.keys(users).length} user(s) left.`)
  console.log('Their sessions stop working within a minute — the gate checks the user still exists.')
} else {
  console.error('usage: manage-users.mjs <add|passwd|email|revoke|list|remove> [username] ["Display Name" | address]')
  process.exit(64)
}
