// Single place that knows how to reach the API.
//
// On the Cloudflare build the site is served by site-worker/index.js, which
// gates every request behind a login and answers /api/* itself — reading and
// writing KV directly, and forwarding the upload endpoints to the old worker
// with the shared secret attached server-side. There the browser holds no
// secret at all: the HttpOnly session cookie is the whole credential.

// Build-time switch, because the same source builds two different sites:
//
//   GitHub Pages (kwanfelix.me)  — no VITE_API_BASE set, so this stays the
//     public worker URL and that site behaves exactly as it always has.
//   Cloudflare (cd-dashboard)    — built with VITE_API_BASE=/api, so calls go
//     to the same origin and ride the login cookie.
//
// Defaulting to the old URL is deliberate: a build that forgets the variable
// degrades to the current behaviour rather than to a site that cannot reach
// its data at all.
export const UPLOAD_WORKER_URL =
  import.meta.env.VITE_API_BASE ?? 'https://cde-data-upload.fkw24.workers.dev'

const STORAGE_KEY = 'cde-access-key'
const RELOAD_KEY = 'cde-signin-reload-at'
const RELOAD_COOLDOWN_MS = 60_000

// sessionStorage rather than a module variable: the whole problem is that the
// page is being torn down and rebuilt, so anything held in memory is reset by
// the very reload it is meant to be counting.
function reloadedRecently() {
  try {
    const at = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0)
    return Date.now() - at < RELOAD_COOLDOWN_MS
  } catch {
    // Storage disabled — better to skip the reload than to risk the loop.
    return true
  }
}

function markReloaded() {
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    // Nothing to do; reloadedRecently() fails closed.
  }
}

export function getAccessKey() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) || ''
  } catch {
    // Private mode / storage disabled — fall back to asking every time.
    return ''
  }
}

export function setAccessKey(key) {
  try {
    if (key) sessionStorage.setItem(STORAGE_KEY, key)
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to do — the key just won't persist across this session.
  }
}

function askForKey(message = 'Enter the dashboard access key') {
  const entered = window.prompt(message)
  if (entered) setAccessKey(entered.trim())
  return entered ? entered.trim() : ''
}

// fetch() against the API, same origin, cookie carried automatically.
//
// A 401 now means the session expired rather than a bad key, and the only
// sensible response is to let the gate render the login page again.
export async function workerFetch(path, init = {}, { retry = true, promptIfMissing = true } = {}) {
  const key = getAccessKey()

  const headers = new Headers(init.headers || {})
  if (key) headers.set('X-Upload-Secret', key)

  const res = await fetch(`${UPLOAD_WORKER_URL}${path}`, { ...init, headers, credentials: 'same-origin' })

  // Session expired or signed out in another tab: reload so the gate can show
  // the login form, rather than leaving a half-dead page behind.
  //
  // Guarded, because this reload is only correct if the reload actually reaches
  // the server. It did not: a precaching service worker answered the navigation
  // from its cache, the signed-out app booted again, called here again, and
  // reloaded again — a page that sat blinking with no way to sign in. The
  // service worker is gone now, but an unconditional reload driven by a server
  // response is a loop waiting for its next cache, so it reloads at most once a
  // minute and otherwise surfaces as an ordinary error.
  if (res.status === 401) {
    const body = await res.clone().json().catch(() => null)
    if (body?.error === 'not_signed_in') {
      if (!reloadedRecently()) {
        markReloaded()
        window.location.reload()
      }
      throw new Error('Your session has expired. Reload the page to sign in again.')
    }
  }

  // Legacy path: only reached if the old typed-key gate is ever re-enabled.
  if (res.status === 401 && retry && promptIfMissing) {
    setAccessKey('')
    const again = askForKey(key ? 'That key was not accepted. Try again' : 'Enter the dashboard access key')
    if (!again) throw new Error('An access key is required to make changes.')
    return workerFetch(path, init, { retry: false, promptIfMissing })
  }

  return res
}

// For links that used to be a plain <a href> to the worker — a bare href
// can't carry a header, so fetch it and hand the browser a blob instead.
export async function workerDownload(path, filename) {
  const res = await workerFetch(path)
  if (!res.ok) throw new Error(`Download failed (${res.status})`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
