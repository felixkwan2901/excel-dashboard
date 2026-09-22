import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// Where the app is served from. GitHub Pages serves it under a repo
// subpath; a domain of its own (dashboard.<company>.co.nz) serves it at the
// root. Everything in src/ already builds asset URLs from
// import.meta.env.BASE_URL, so this one value is the only thing that needs
// to change to move hosts:
//
//     APP_BASE=/ npm run build
//
const base = process.env.APP_BASE ?? '/excel-dashboard/'

// The login-gated Cloudflare copy ships a service worker whose only job is to
// remove itself.
//
// A precaching service worker and a login gate cannot both be right about the
// same request. The service worker answered navigations from its cache, so a
// signed-out browser got the app shell instead of the login page — and then
// the app's own 401 handler reloaded, the cache answered again, and the page
// sat there blinking. Data was never exposed (every /api call still 401s) but
// the site was unusable and the gate was cosmetic for anything precached.
//
// selfDestroying builds a service worker that unregisters itself and deletes
// its caches, which is the only way to reach browsers that already installed
// the old one. Not shipping a service worker at all would have left them on it
// forever.
//
// GitHub Pages keeps its PWA: no gate there, nothing to contradict.
const selfDestroying = process.env.PWA_SELF_DESTROY === '1'

export default defineConfig({
  base,
  // Baked into the JS bundle so a loaded page can tell whether a newer
  // deploy exists (see src/main.jsx's build-id check) — GITHUB_SHA is set
  // automatically by GitHub Actions; falls back to 'dev' for local builds,
  // where staleness isn't a concern.
  define: {
    __BUILD_ID__: JSON.stringify(process.env.GITHUB_SHA ?? 'dev'),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      selfDestroying,
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Cassidy-Davies Electrical — Operations Dashboard',
        short_name: 'CDE Dashboard',
        description: 'BPMN workflow and job pipeline dashboard for Cassidy-Davies Electrical.',
        theme_color: '#1f2a37',
        background_color: '#f4f6f8',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Deliberately excludes the .xlsx workbook — it's live business
        // data that changes with every update, not a static app-shell
        // asset. Precaching it meant the dashboard could keep serving a
        // stale copy until the service worker's own update cycle caught
        // up, independent of the auto-reload logic below (which only
        // reloads once a NEW service worker has installed — it doesn't
        // make that installation happen any sooner). Left out of the
        // precache, the workbook always goes straight to the network.
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        // Without these, a new service worker installs but sits stuck in
        // "waiting" behind any already-open tab — it only ever activates
        // once every tab is closed, which for a long-lived open tab (or an
        // installed PWA instance) can mean updates never actually land.
        // skipWaiting activates a new SW immediately; clientsClaim makes it
        // take control of already-open tabs right away instead of only new
        // ones — together they're what makes the auto-reload in main.jsx
        // actually fire promptly instead of waiting indefinitely.
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
})
