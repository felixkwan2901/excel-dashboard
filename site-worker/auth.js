// Password hashing and session cookies for the dashboard gate.
//
// Everything here uses WebCrypto, which is what the Workers runtime gives us —
// there is no bcrypt or scrypt available, so passwords are PBKDF2-SHA256 with a
// per-user salt and a high iteration count, and sessions are HMAC-signed
// cookies rather than server-side state (there is nowhere cheap to keep state
// that every edge location can read).

export const SESSION_COOKIE = 'cde_session'
// The Workers runtime refuses more than 100,000 PBKDF2 iterations
// ("iteration counts above 100000 are not supported"), so this is the ceiling,
// not a choice. It is below OWASP's 600k recommendation, which is tolerable
// here because the hashes never leave KV — the data endpoint's key allowlist
// cannot match `auth:users`, so reading them requires the Cloudflare account
// itself. The minimum password length in scripts/manage-users.mjs carries the
// rest of the weight.
export const PBKDF2_ITERATIONS = 100_000
const SESSION_DAYS = 30

const enc = new TextEncoder()

const toHex = (buf) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

const fromHex = (hex) =>
  new Uint8Array((hex.match(/.{1,2}/g) ?? []).map((b) => parseInt(b, 16)))

const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const unb64url = (s) => {
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4)
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return new Uint8Array([...raw].map((c) => c.charCodeAt(0)))
}

// Comparing secrets with === leaks their contents through response timing.
// Length is not secret here, so an early return on length is fine.
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i]
  return diff === 0
}

export async function hashPassword(password, saltHex, iterations = PBKDF2_ITERATIONS) {
  const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    256,
  )
  return { salt: toHex(salt), hash: toHex(bits), iterations }
}

export async function verifyPassword(password, record) {
  if (!record?.salt || !record?.hash) return false
  const { hash } = await hashPassword(password, record.salt, record.iterations ?? PBKDF2_ITERATIONS)
  return timingSafeEqual(fromHex(hash), fromHex(record.hash))
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
}

export async function signSession(username, secret, days = SESSION_DAYS) {
  const payload = { u: username, exp: Math.floor(Date.now() / 1000) + days * 86400 }
  const body = b64url(enc.encode(JSON.stringify(payload)))
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body))
  return `${body}.${b64url(sig)}`
}

// Returns the username, or null. Any malformed, unsigned, re-signed or expired
// token is simply "not logged in" — never a partial trust.
export async function readSession(token, secret) {
  if (!token || !secret) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  let expected
  try {
    expected = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body))
  } catch {
    return null
  }
  if (!timingSafeEqual(unb64url(sig), new Uint8Array(expected))) return null
  try {
    const payload = JSON.parse(new TextDecoder().decode(unb64url(body)))
    if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) return null
    return typeof payload.u === 'string' ? payload.u : null
  } catch {
    return null
  }
}

export function sessionCookie(token, days = SESSION_DAYS) {
  const age = token ? days * 86400 : 0
  return `${SESSION_COOKIE}=${token ?? ''}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${age}`
}

export function readCookie(request, name) {
  const header = request.headers.get('Cookie') ?? ''
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
  return null
}
