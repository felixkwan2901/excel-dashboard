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
// Two ways in, and the second one is optional:
//
//   a name and a password          always available
//   a code emailed to your address  only when RESEND_API_KEY and MAIL_FROM are
//                                   set; the page does not offer it otherwise
//
// Bindings: ASSETS (the built site), APP_DATA (KV).
// Secrets:  SESSION_SECRET (required), UPLOAD_SECRET (optional, for the proxy),
//           RESEND_API_KEY (optional, turns on email sign-in).
// Vars:     MAIL_FROM (required by email sign-in, e.g. "CDE <no-reply@example.com>").

import {
  SESSION_COOKIE, CODE_TTL_SECONDS, generateCode, normaliseEmail, readChallenge,
  readCookie, readSession, sessionCookie, signChallenge, signSession, userByEmail,
  verifyPassword,
} from './auth.js'
import { emailEnabled, sendLoginCode } from './mail.js'
import { renderLogin } from './login-page.js'

// Same allowlist as upload-worker/src/index.js. It deliberately cannot match
// `auth:users` — without this, any signed-in user could overwrite the password
// file through the ordinary data endpoint and lock everyone else out.
const APP_DATA_KEY_RE =
  /^(weekly|completion|jobCreated|field):[A-Za-z0-9]{1,20}$|^override:(main-sheet|claim-calculator|upcoming-work)$|^planning:(staff-roster|servicing|working-days|staff-on-tools|avg-hourly-rate|job-owners|job-categories|job-details|job-checklist|field-checklist-overrides|claim-fields|upcoming-work)$|^fieldTasks:(commercial|residential)$/

const UPLOAD_WORKER = 'https://cde-data-upload.fkw24.workers.dev'
const PROXY_PATHS = new Set(['/upload', '/replace', '/new-job', '/command', '/status', '/archive-job', '/download'])

// The only files served without a session, and they are served without one for
// a specific reason: a browser that installed the old precaching service
// worker can only be rescued by fetching the new one that unregisters itself,
// and a signed-out browser is exactly the browser that is stuck. Gating these
// left no way out of the loop at all — the service worker answered navigations
// from its cache, so the login page never rendered, and its own update check
// was refused because it was not signed in.
//
// None of them carry data. sw.js and the manifest list asset filenames that
// are in a public repo anyway.
const PUBLIC_PATHS = new Set(['/sw.js', '/registerSW.js', '/manifest.webmanifest'])
const isPublicAsset = (path) => PUBLIC_PATHS.has(path) || /^\/workbox-[\w-]+\.js$/.test(path)

const MAX_FAILURES = 10
const LOCKOUT_SECONDS = 900

// Asking for a code is free to the requester and not free to us: every request
// is an email, and the free tier is 100 a day. This is the cap per address.
const MAX_CODE_REQUESTS = 5
const CODE_REQUEST_WINDOW = 900

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

// Only ever redirect within this site. An open redirect here would let a
// phishing link bounce off a hostname the recipient has learned to trust, and
// `next` arrives from a form field or a query string on every route that uses
// it — so this is applied at the point of use, not at the point of parsing.
const safeNext = (next) => {
  const n = String(next ?? '/')
  return n.startsWith('/') && !n.startsWith('//') ? n : '/'
}

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

  let users = await loadUsers(env)
  let record = users?.[session.user]

  // A validly signed session naming somebody the cached list has never heard
  // of means the list is stale, not that the session is forged — the
  // signature cannot be produced without SESSION_SECRET. So check once
  // against a fresh read before refusing.
  //
  // Without this, adding a user was visibly broken: sign-in succeeded,
  // because the login path already reads fresh, and then every asset request
  // for the next minute was refused by isolates still holding the list from
  // before the account existed. The page arrived with no CSS and half its
  // data missing, which reads as the site being broken rather than as a
  // cache catching up. It was doing this to every new account.
  //
  // The extra KV read only happens for a session whose user is missing from
  // the cache — a brand new account, or one just deleted. Both are rare, and
  // the second is the case where paying a read to get the answer right is
  // exactly what you want.
  if (!record) {
    users = await loadUsers(env, { fresh: true })
    record = users?.[session.user]
    if (!record) return null
  }

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

// Every render of the gate goes through here, so no route can forget to tell
// the page whether the email route exists. Without that the page would offer
// "email me a code" on a Worker with no API key, and the link would lead to a
// form that silently never sends anything.
const loginResponse = (env, opts, status = 401) =>
  new Response(renderLogin({ ...opts, emailEnabled: emailEnabled(env) }), {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })

// Which form a signed-out visitor meets first. Email when it is configured,
// because it is the one that needs nothing remembered; the password form is
// always one link away.
const defaultMode = (env) => (emailEnabled(env) ? 'email' : 'password')

async function handleLogin(request, env) {
  if (!env.SESSION_SECRET) {
    return loginResponse(env, { error: 'The site is not finished being set up (no SESSION_SECRET).' }, 500)
  }

  const form = await request.formData().catch(() => null)
  const username = String(form?.get('username') ?? '').trim().toLowerCase()
  const password = String(form?.get('password') ?? '')
  const next = String(form?.get('next') ?? '/')

  const fail = (error, status = 401) =>
    loginResponse(env, { mode: 'password', error, username, next }, status)

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
  //
  // An account created by `invite` has no salt and no hash — it signs in by
  // emailed code only. That has to take the same time as everything else too,
  // or the delay alone says "this name exists and has no password", which is a
  // more useful thing to learn than whether the name exists at all.
  const hasPassword = Boolean(record?.salt && record?.hash)
  const ok = hasPassword
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
  return seeOther(safeNext(next), sessionCookie(token))
}

// Step one of email sign-in: work out who this address belongs to, send them
// six digits, and hand the browser a signed challenge to submit them against.
async function handleCodeRequest(request, env) {
  const form = await request.formData().catch(() => null)
  const email = normaliseEmail(form?.get('email'))
  const next = String(form?.get('next') ?? '/')

  if (!emailEnabled(env) || !env.SESSION_SECRET) {
    return loginResponse(env, { mode: 'password', next, error: 'Email sign-in is not set up. Use your password.' })
  }
  if (!email) return loginResponse(env, { mode: 'email', next, error: 'Enter your work email.' })

  const requests = await failureCount(env, `code:${email}`)
  if (requests >= MAX_CODE_REQUESTS) {
    return loginResponse(env, {
      mode: 'email', email, next,
      error: 'Too many codes requested. Wait fifteen minutes and try again.',
    }, 429)
  }
  await env.APP_DATA.put(`auth:fail:code:${email}`, String(requests + 1), {
    expirationTtl: CODE_REQUEST_WINDOW,
  })

  const users = await loadUsers(env, { fresh: true })
  const match = userByEmail(users, email)

  // An unknown address gets the same page as a known one, and no email. Saying
  // "no account here" would turn this form into a way to test which of a
  // company's addresses have dashboard access.
  //
  // The challenge is still signed, over a code nobody was sent, so the second
  // step fails the way a wrong code fails rather than the way a broken page
  // does.
  const code = generateCode()
  const challenge = await signChallenge(
    match?.username ?? '', email, code, env.SESSION_SECRET,
  )

  if (match) {
    const sent = await sendLoginCode(env, { to: email, code, minutes: Math.round(CODE_TTL_SECONDS / 60) })
    if (!sent.ok) {
      return loginResponse(env, {
        mode: 'email', email, next,
        error: 'The code could not be sent just now. Try your password instead.',
      }, 502)
    }
  }

  return loginResponse(env, { mode: 'code', email, challenge, next }, 200)
}

// Step two: the six digits, checked against the challenge. Nothing was stored
// between the two steps, so there is no expired-or-missing-record case here —
// a code either recomputes the signature or it does not.
async function handleCodeVerify(request, env) {
  const form = await request.formData().catch(() => null)
  const code = String(form?.get('code') ?? '').replace(/\D/g, '')
  const challenge = String(form?.get('challenge') ?? '')
  const email = normaliseEmail(form?.get('email'))
  const next = String(form?.get('next') ?? '/')

  const again = (error, status = 401) =>
    loginResponse(env, { mode: 'code', email, challenge, next, error }, status)

  if (!env.SESSION_SECRET) return again('The site is not finished being set up.', 500)
  if (!challenge) return loginResponse(env, { mode: 'email', email, next, error: 'Start again.' })

  const failures = await failureCount(env, `verify:${email}`)
  if (failures >= MAX_FAILURES) {
    return again('Too many attempts. Wait fifteen minutes and try again.', 429)
  }

  const claim = await readChallenge(challenge, code, env.SESSION_SECRET)
  if (!claim || !claim.user) {
    await recordFailure(env, `verify:${email}`, failures)
    return again('That code is wrong or has expired.')
  }

  // The account has to still exist, and the address on it has to still be the
  // one the code went to. Both can have changed in the ten minutes the
  // challenge is good for, and a challenge is not a licence to outlive them.
  const users = await loadUsers(env, { fresh: true })
  const record = users?.[claim.user]
  if (!record || normaliseEmail(record.email) !== claim.email) {
    return again('That code is no longer valid. Ask for a new one.')
  }

  await env.APP_DATA.delete(`auth:fail:verify:${email}`)
  await env.APP_DATA.delete(`auth:fail:code:${email}`)
  const token = await signSession(claim.user, env.SESSION_SECRET, record.v ?? 1)
  return seeOther(safeNext(next), sessionCookie(token))
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
    if (path === '/auth/code' && request.method === 'POST') return handleCodeRequest(request, env)
    if (path === '/auth/verify' && request.method === 'POST') return handleCodeVerify(request, env)

    if (path === '/auth/logout') {
      return seeOther('/', sessionCookie(null))
    }

    if (isPublicAsset(path)) return env.ASSETS.fetch(request)

    const user = await currentUser(request, env)

    if (!user) {
      // An unauthenticated API call gets JSON, not a login page — the front end
      // can then tell the difference between "signed out" and "broken".
      if (path.startsWith('/api/')) {
        return json({ ok: false, error: 'not_signed_in' }, 401)
      }
      // `?signin=` is how the two forms link to each other, and it only means
      // anything on the root — anywhere else it is just part of the URL the
      // visitor was trying to reach, and belongs in `next` untouched.
      const asked = path === '/' ? url.searchParams.get('signin') : null
      const mode = asked === 'password' || asked === 'email' ? asked : defaultMode(env)
      const next = asked ? safeNext(url.searchParams.get('next')) : path + url.search
      // Carried back from the code step so a mistyped address arrives in the
      // box ready to correct. It is reflected into a value attribute, which
      // renderLogin escapes, and it is never trusted for anything else.
      const email = asked === 'email' ? (url.searchParams.get('email') ?? '').slice(0, 200) : ''
      return loginResponse(env, { mode, next, email })
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
