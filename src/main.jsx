import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

// Earlier versions of this file auto-reloaded the page the moment a new
// service worker took over or a build-id mismatch was detected, guarded
// only by a cooldown to stop it looping. In practice it kept looping
// anyway — reload timing around a fresh deploy is inherently unpredictable
// (CDN edge propagation, service-worker activation races), and no fixed
// cooldown number is provably long enough to rule that out. Auto-reloading
// AT ALL is what makes a loop possible; removing that possibility entirely
// is more valuable here than the small convenience of not having to click
// anything. This shows a small dismiss-free banner instead and lets the
// person actually looking at the screen decide when to refresh — it can
// never reload on its own, so it can never loop.
function showUpdateBanner() {
  if (document.getElementById('cde-update-banner')) return
  const bar = document.createElement('div')
  bar.id = 'cde-update-banner'
  bar.style.cssText =
    'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:9999;' +
    'display:flex;align-items:center;gap:12px;padding:10px 16px;border-radius:12px;' +
    'background:#11161c;border:1px solid rgba(255,255,255,0.1);color:#e5e5e5;' +
    'font:13px -apple-system,system-ui,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,0.4);'
  const label = document.createElement('span')
  label.textContent = 'A new version is available.'
  const button = document.createElement('button')
  button.textContent = 'Refresh'
  button.style.cssText =
    'background:#38b86a;color:#06210a;border:none;border-radius:8px;padding:6px 14px;' +
    'font-weight:600;cursor:pointer;font-size:13px;'
  button.onclick = () => {
    const url = new URL(window.location.href)
    url.searchParams.set('_r', Date.now())
    window.location.assign(url.toString())
  }
  bar.append(label, button)
  document.body.appendChild(bar)
}

// Data updates (via the upload form) and app updates both ship as a new
// build — without this, an already-open tab/installed PWA keeps running
// the old JS bundle until the person happens to refresh on their own.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', showUpdateBanner)
}

registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    registration.update()
    setInterval(() => registration.update(), 60 * 1000)
  },
})

// The build-id check exists because a stale page can otherwise sit
// indefinitely on old data without any error to signal it — GitHub Pages'
// CDN serves index.html with a 10-minute Cache-Control, so a normal
// refresh within that window may never even ask the network. This fetches
// a tiny always-fresh file with a cache-busting query string (bypassing
// every caching layer, not just the browser's) rather than reloading
// outright.
async function checkForNewBuild() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}build-id.txt?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return
    const latest = (await res.text()).trim()
    if (latest && latest !== __BUILD_ID__) showUpdateBanner()
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
