import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

// Both auto-reload triggers below (a new service worker taking over, and
// the build-id check further down) used a plain in-memory flag to reload
// at most once — which sounds safe, but a full page reload wipes all
// in-memory state, so that guard doesn't survive the reload it's supposed
// to be limiting. Right as a deploy is landing, GitHub Pages' CDN can
// briefly serve inconsistent snapshots across its edge nodes (new
// build-id.txt, still-old JS, or vice versa) for a few seconds — each
// reload during that window sees ANOTHER apparent mismatch and reloads
// again, immediately, forever, which is what "keeps refreshing on its
// own" actually was. sessionStorage survives a reload (unlike a JS
// variable), so a timestamp there caps this to at most one auto-reload
// per 15 seconds, comfortably outlasting that propagation window while
// still catching genuine staleness on the very next check.
const RELOAD_COOLDOWN_MS = 15_000
function reloadIfNotCoolingDown() {
  const last = Number(sessionStorage.getItem('cde.lastAutoReload') || 0)
  if (Date.now() - last < RELOAD_COOLDOWN_MS) return
  sessionStorage.setItem('cde.lastAutoReload', String(Date.now()))
  window.location.reload()
}

// Data updates (via the upload form) and app updates both ship as a new
// build. Without this, an already-open tab/installed PWA keeps running the
// old JS bundle — which requests the old, content-hashed data file — until
// the user happens to fully reload. This checks for a new service worker
// periodically and reloads automatically the moment one takes over, so
// updates always show up without the user needing to force-refresh.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', reloadIfNotCoolingDown)
}

registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    // Check right away too, not just on the recurring interval below — the
    // interval alone meant a page load shortly after a fresh deploy could
    // sit on the old version for up to 60s before the first check fired.
    registration.update()
    setInterval(() => registration.update(), 60 * 1000)
  },
})

// The service worker's own update check (above) is timing-dependent and
// only ever as fast as its next check — it isn't what actually stops an
// already-loaded page from running stale code. The real culprit for
// "refresh still shows old data" is upstream of the service worker
// entirely: GitHub Pages' CDN serves index.html with a 10-minute
// Cache-Control, so a normal refresh within that window never even asks
// the network — the browser just replays whatever JS bundle it already
// has cached, which then fetches an old-but-still-existing (see
// keep_files in deploy.yml) hashed copy of the workbook: a real network
// fetch that still returns old data, no error, nothing to catch.
//
// This checks a tiny, always-fresh build-id file directly, with a
// per-request cache-busting query string so no cache layer — not the
// browser's, not GitHub Pages' CDN — can serve back a stale copy
// regardless of any Cache-Control header. If it doesn't match the ID
// baked into the JS currently running, a newer deploy exists and this
// reloads immediately rather than waiting on the service worker cycle.
async function checkForNewBuild() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}build-id.txt?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return
    const latest = (await res.text()).trim()
    if (latest && latest !== __BUILD_ID__) reloadIfNotCoolingDown()
  } catch {
    // A network hiccup just means this check retries on the next trigger.
  }
}
checkForNewBuild()
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkForNewBuild()
})
setInterval(checkForNewBuild, 60 * 1000)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
