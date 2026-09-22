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

// Returns null rather than throwing on junk. atob() raises on any character
// outside the base64 alphabet, and everything fed to this arrives from a
// cookie or a form field — places where a truncated value is ordinary and a
// deliberately malformed one is free to produce. Letting it throw turned a
// corrupted cookie into a 500 on every route, including the login page that
// would have replaced it.
const unb64url = (s) => {
  try {
    const padded = s + '='.repeat((4 - (s.length % 4)) % 4)
    const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
    return new Uint8Array([...raw].map((c) => c.charCodeAt(0)))
  } catch {
    return null
  }
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

// `version` is the user's session version. It is stamped into the cookie and
// compared against the stored one on every request, so bumping a user's
// version signs that person out everywhere without touching anyone else.
export async function signSession(username, secret, version = 1, days = SESSION_DAYS) {
  const payload = { u: username, v: version, exp: Math.floor(Date.now() / 1000) + days * 86400 }
  const body = b64url(enc.encode(JSON.stringify(payload)))
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body))
  return `${body}.${b64url(sig)}`
}

// Returns { user, version }, or null. Any malformed, unsigned, re-signed or
// expired token is simply "not logged in" — never a partial trust.
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
  const given = unb64url(sig)
  if (!given || !timingSafeEqual(given, new Uint8Array(expected))) return null
  try {
    const raw = unb64url(body)
    if (!raw) return null
    const payload = JSON.parse(new TextDecoder().decode(raw))
    if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) return null
    if (typeof payload.u !== 'string') return null
    // Cookies issued before versioning existed count as version 1, so adding
    // this does not sign everyone out on deploy.
    return { user: payload.u, version: typeof payload.v === 'number' ? payload.v : 1 }
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

// ---------------------------------------------------------------------------
// Email sign-in codes
// ---------------------------------------------------------------------------

export const CODE_TTL_SECONDS = 600

// Six digits, drawn uniformly. `% 1_000_000` on a 32-bit value would make the
// low codes very slightly likelier; rejection sampling costs one extra draw
// once every few thousand calls and removes the bias entirely.
export function generateCode() {
  const limit = Math.floor(0xffffffff / 1_000_000) * 1_000_000
  const buf = new Uint32Array(1)
  let n
  do {
    crypto.getRandomValues(buf)
    ;[n] = buf
  } while (n >= limit)
  return String(n % 1_000_000).padStart(6, '0')
}

// The code is never stored. Instead the challenge carries who it is for and
// when it expires, signed with the code mixed into the MAC — so the server can
// check a submitted code by recomputing the MAC, and learns nothing from the
// challenge alone.
//
// Storing the code in KV would have been the obvious approach and is the wrong
// one here: KV is eventually consistent, and a code written in one location and
// read back seconds later from another can legitimately come back missing. That
// failure would look exactly like a wrong code, at random, to real people. This
// version has no read to be stale.
//
// It does mean a code stays usable until it expires rather than being burned on
// first use. For a ten-minute window on a code that only ever exists in the
// recipient's own inbox, that is the better trade.
export async function signChallenge(username, email, code, secret, ttl = CODE_TTL_SECONDS) {
  const payload = { u: username, e: email, exp: Math.floor(Date.now() / 1000) + ttl }
  const body = b64url(enc.encode(JSON.stringify(payload)))
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(`${body}.${code}`))
  return `${body}.${b64url(sig)}`
}

// Returns { user, email } when the code is right and the challenge is intact
// and unexpired, otherwise null. As with readSession, every failure mode is the
// same failure: there is no such thing as a partly valid challenge.
export async function readChallenge(challenge, code, secret) {
  if (!challenge || !code || !secret) return null
  const [body, sig] = challenge.split('.')
  if (!body || !sig) return null
  let expected
  try {
    expected = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(`${body}.${code}`))
  } catch {
    return null
  }
  const given = unb64url(sig)
  if (!given || !timingSafeEqual(given, new Uint8Array(expected))) return null
  try {
    const raw = unb64url(body)
    if (!raw) return null
    const payload = JSON.parse(new TextDecoder().decode(raw))
    if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) return null
    if (typeof payload.u !== 'string' || typeof payload.e !== 'string') return null
    return { user: payload.u, email: payload.e }
  } catch {
    return null
  }
}

export const normaliseEmail = (s) => String(s ?? '').trim().toLowerCase()

// Who owns this address. Emails are unique by construction — manage-users.mjs
// refuses to set one that another account already has — so the first match is
// the only match.
export function userByEmail(users, email) {
  const wanted = normaliseEmail(email)
  if (!wanted) return null
  for (const [username, record] of Object.entries(users ?? {})) {
    if (normaliseEmail(record?.email) === wanted) return { username, record }
  }
  return null
}
