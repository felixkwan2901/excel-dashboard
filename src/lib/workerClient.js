// Single place that knows how to reach the upload worker.
//
// The worker now requires an access key on every request (see
// upload-worker/src/index.js). The key is NOT baked into this bundle — the
// bundle is public, so anything in it is public too. Instead the operator
// types it once per browser session and it lives in sessionStorage, which
// dies with the tab.
//
// Once the dashboard is behind Cloudflare Access (MIGRATION.md step 3b) the
// prompt can go away: Access will carry identity via cookie and the worker
// can trust the request instead.

export const UPLOAD_WORKER_URL = 'https://cde-data-upload.fkw24.workers.dev'

const STORAGE_KEY = 'cde-access-key'

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

// fetch() against the worker.
//
// The worker's access-key gate is currently switched off, so no key is
// required and nobody is prompted for one. A key is still sent if one
// happens to be stored, and a 401 still triggers a re-prompt — so turning
// the gate back on in upload-worker/src/index.js needs no change here.
export async function workerFetch(path, init = {}, { retry = true, promptIfMissing = true } = {}) {
  const key = getAccessKey()

  const headers = new Headers(init.headers || {})
  if (key) headers.set('X-Upload-Secret', key)

  const res = await fetch(`${UPLOAD_WORKER_URL}${path}`, { ...init, headers })

  // Only reached if the gate is re-enabled on the worker.
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
