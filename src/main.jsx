import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

// Data updates (via the upload form) and app updates both ship as a new
// build. Without this, an already-open tab/installed PWA keeps running the
// old JS bundle — which requests the old, content-hashed data file — until
// the user happens to fully reload. This checks for a new service worker
// periodically and reloads automatically the moment one takes over, so
// updates always show up without the user needing to force-refresh.
if ('serviceWorker' in navigator) {
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return
    reloaded = true
    window.location.reload()
  })
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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
