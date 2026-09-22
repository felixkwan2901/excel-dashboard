// The dashboard, served from behind a login.
//
// This Worker sits in front of the built site (`run_worker_first: true`, so it
// runs before any static asset is served — without that, index.html and the
// workbook would still be public). It does three jobs:
//
//   1. the login gate, for every request including static files
//   2. /api/app-data, reading and writing the same KV namespace the old
//      upload worker uses, on the same origin so the session cookie covers it
//   3. a proxy for the endpoints that still live on the upload worker
//      (upload, replace, new-job, command, status, archive-job), attaching
//      UPLOAD_SECRET server-side — the browser never sees it
//
// Bindings: ASSETS (the built site), APP_DATA (KV).
// Secrets:  SESSION_SECRET (required), UPLOAD_SECRET (optional, for the proxy).

import {
  SESSION_COOKIE, readCookie, readSession, sessionCookie, signSession, verifyPassword,
} from './auth.js'
import { renderLogin } from './login-page.js'

// Same allowlist as upload-worker/src/index.js. It deliberately cannot match
// `auth:users` — without this, any signed-in user could overwrite the password
// file through the ordinary data endpoint and lock everyone else out.
const APP_DATA_KEY_RE =
  /^(weekly|completion|jobCreated|field):[A-Za-z0-9]{1,20}$|^override:(main-sheet|claim-calculator|upcoming-work)$|^planning:(staff-roster|servicing|working-days|staff-on-tools|avg-hourly-rate|job-owners|job-checklist|claim-fields|upcoming-work)$|^fieldTasks:(commercial|residential)$/

const UPLOAD_WORKER = 'https://cde-data-upload.fkw24.workers.dev'
const PROXY_PATHS = new Set(['/upload', '/replace', '/new-job', '/command', '/status', '/archive-job', '/download'])

const MAX_FAILURES = 10
const LOCKOUT_SECONDS = 900

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

const seeOther = (location, cookie) => {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' })
  if (cookie) headers.append('Set-Cookie', cookie)
  return new Response(null, { status: 303, headers })
}

// run_worker_first means every request reaches this Worker, including each JS,
// CSS and image file. Reading the user list from KV on all of them would add a
// round trip to every asset and burn the free tier's read budget, so it is
// memoised per isolate and the KV read is edge-cached for the same window.
//
// The cost is that revoking a session takes up to USERS_TTL_MS to bite. That is
// the trade: a minute of staleness in exchange for not paying a KV read per
// image. Rotating SESSION_SECRET is still the instant, everyone-out option.
const USERS_TTL_MS = 60_000
let usersCache = { at: 0, value: null }

// `fresh` skips both caches. Sign-in uses it, because an admin who has just
// added a user or changed a password will try it immediately and a stale
// answer looks exactly like a wrong password. Sign-ins are rare; asset
// requests are not, which is why only this path pays for it.
async function loadUsers(env, { fresh = false } = {}) {
  const now = Date.now()
  if (!fresh && usersCache.value && now - usersCache.at < USERS_TTL_MS) return usersCache.value
  const raw = await env.APP_DATA.get('auth:users', fresh ? {} : { cacheTtl: 60 })
  let value = null
  if (raw) {
    try {
      value = JSON.parse(raw)
    } catch {
      value = null
    }
  }
  usersCache = { at: now, value }
  return value
}

// A valid signature is not enough on its own: the session also has to match the
// version currently stored against that user, and the user has to still exist.
// That is what lets one person be signed out — or deleted — without disturbing
// anybody else's session.
async function currentUser(request, env) {
  const session = await readSession(readCookie(request, SESSION_COOKIE), env.SESSION_SECRET)
  if (!session) return null
  const users = await loadUsers(env)
  const record = users?.[session.user]
  if (!record) return null
  if ((record.v ?? 1) !== session.version) return null
  return session.user
}

// Throttle per username. Only written on failure, so it costs nothing in the
// normal case — KV's free tier allows 1,000 writes a day and the dashboard
// spends those on checklist ticks.
async function failureCount(env, username) {
  const v = await env.APP_DATA.get(`auth:fail:${username}`)
  return v ? parseInt(v, 10) || 0 : 0
}

async function recordFailure(env, username, count) {
  await env.APP_DATA.put(`auth:fail:${username}`, String(count + 1), {
    expirationTtl: LOCKOUT_SECONDS,
  })
}

async function handleLogin(request, env) {
  if (!env.SESSION_SECRET) {
    return new Response(renderLogin({ error: 'The site is not finished being set up (no SESSION_SECRET).' }), {
      status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  const form = await request.formData().catch(() => null)
  const username = String(form?.get('username') ?? '').trim().toLowerCase()
  const password = String(form?.get('password') ?? '')
  const next = String(form?.get('next') ?? '/')

  const fail = (error, status = 401) =>
    new Response(renderLogin({ error, username, next }), {
      status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    })

  if (!username || !password) return fail('Enter your name and password.')

  const failures = await failureCount(env, username)
  if (failures >= MAX_FAILURES) {
    return fail('Too many attempts. Wait fifteen minutes and try again.', 429)
  }

  const users = await loadUsers(env, { fresh: true })
  const record = users?.[username]

  // Verify even when the user does not exist, against a throwaway record, so a
  // wrong name and a wrong password take the same time to answer. Otherwise the
  // response time tells an attacker which names are real.
  const ok = record
    ? await verifyPassword(password, record)
    : (await verifyPassword(password, {
        salt: '00000000000000000000000000000000',
        hash: '0'.repeat(64),
      }), false)

  if (!ok) {
    await recordFailure(env, username, failures)
    return fail('That name and password did not match.')
  }

  await env.APP_DATA.delete(`auth:fail:${username}`)
  const token = await signSession(username, env.SESSION_SECRET, record.v ?? 1)
  // Only ever redirect within this site — an open redirect here would let a
  // phishing link bounce off a trusted hostname.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/'
  return seeOther(safeNext, sessionCookie(token))
}

async function handleAppData(request, env) {
  const url = new URL(request.url)

  if (request.method === 'GET') {
    const key = url.searchParams.get('key') ?? ''
    if (!APP_DATA_KEY_RE.test(key)) return json({ ok: false, error: 'bad_key' }, 400)
    const value = await env.APP_DATA.get(key)
    return json({ ok: true, value })
  }

  if (request.method === 'POST') {
    const body = await request.json().catch(() => null)
    if (!body) return json({ ok: false, error: 'bad_request' }, 400)
    const { key, value } = body
    if (!APP_DATA_KEY_RE.test(key ?? '')) return json({ ok: false, error: 'bad_key' }, 400)
    if (typeof value !== 'string' || value.length > 100_000) {
      return json({ ok: false, error: 'bad_value' }, 400)
    }
    await env.APP_DATA.put(key, value)
    return json({ ok: true })
  }

  return json({ ok: false, error: 'method_not_allowed' }, 405)
}

// The endpoints still living on the upload worker. Forwarded with the shared
// secret attached here, so the secret stays server-side and the old worker can
// finally have its gate switched back on.
async function proxyToUploadWorker(request, env, path) {
  const url = new URL(request.url)
  const target = `${UPLOAD_WORKER}${path}${url.search}`
  const headers = new Headers(request.headers)
  headers.delete('Cookie')
  headers.delete('Host')
  if (env.UPLOAD_SECRET) headers.set('X-Upload-Secret', env.UPLOAD_SECRET)
  return fetch(target, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
  })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname

    if (path === '/auth/login' && request.method === 'POST') return handleLogin(request, env)

    if (path === '/auth/logout') {
      return seeOther('/', sessionCookie(null))
    }

    const user = await currentUser(request, env)

    if (!user) {
      // An unauthenticated API call gets JSON, not a login page — the front end
      // can then tell the difference between "signed out" and "broken".
      if (path.startsWith('/api/')) {
        return json({ ok: false, error: 'not_signed_in' }, 401)
      }
      return new Response(renderLogin({ next: path + url.search }), {
        status: 401,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      })
    }

    if (path === '/api/whoami') return json({ ok: true, user })

    if (path === '/api/app-data') return handleAppData(request, env)

    if (path.startsWith('/api/')) {
      const rest = path.slice(4)
      if (PROXY_PATHS.has(rest)) return proxyToUploadWorker(request, env, rest)
      return json({ ok: false, error: 'not_found' }, 404)
    }

    return env.ASSETS.fetch(request)
  },
}
