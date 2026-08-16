import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/excel-dashboard/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Cassidy-Davies Electrical — Operations Dashboard',
        short_name: 'CDE Dashboard',
        description: 'BPMN workflow and job pipeline dashboard for Cassidy-Davies Electrical.',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        start_url: '/excel-dashboard/',
        scope: '/excel-dashboard/',
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
