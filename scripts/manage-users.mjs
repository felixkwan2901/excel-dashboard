#!/usr/bin/env node
// Add, list and remove dashboard logins.
//
//   node scripts/manage-users.mjs add <username> "Display Name"   # prompts, or reads $PASSWORD
//   node scripts/manage-users.mjs list
//   node scripts/manage-users.mjs remove <username>
//
// Passwords are hashed here and only the hash is written to KV — the plain
// password never leaves this machine and is never stored anywhere.
// Writes go straight to KV via wrangler, not through the site, because the
// data endpoint's key allowlist deliberately refuses `auth:users`.
import { execFileSync } from 'node:child_process'
import { webcrypto as crypto } from 'node:crypto'
import readline from 'node:readline/promises'

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

const [cmd, username, displayName] = process.argv.slice(2)
const users = readUsers()

if (cmd === 'list') {
  const names = Object.keys(users)
  console.log(names.length ? names.map((u) => `  ${u}  (${users[u].name ?? '—'})`).join('\n') : '  (no users yet)')
} else if (cmd === 'add') {
  if (!username) { console.error('usage: add <username> "Display Name"'); process.exit(64) }
  let password = process.env.PASSWORD
  if (!password) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    password = await rl.question(`Password for ${username}: `)
    rl.close()
  }
  // Longer minimum than usual, because the Workers PBKDF2 cap means we cannot
  // buy strength with iterations.
  if (!password || password.length < 12) {
    console.error('Password must be at least 12 characters.'); process.exit(65)
  }
  users[username.toLowerCase()] = { ...(await hashPassword(password)), name: displayName ?? username }
  writeUsers(users)
  console.log(`Added ${username.toLowerCase()}. ${Object.keys(users).length} user(s) total.`)
} else if (cmd === 'remove') {
  if (!users[username]) { console.error(`No such user: ${username}`); process.exit(66) }
  delete users[username]
  writeUsers(users)
  console.log(`Removed ${username}. ${Object.keys(users).length} user(s) left.`)
} else {
  console.error('usage: manage-users.mjs <add|list|remove> [username] ["Display Name"]')
  process.exit(64)
}
