import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'

const BACKGROUND = '#1c2131'

// Installable app: a web manifest plus a service worker that caches the built app so it starts
// offline. The user's data is already local (IndexedDB), so the whole app works without a network.
const pwa = VitePWA({
  // A new version waits until the user reloads from the prompt (src/components/AppUpdate.vue),
  // so an update never reloads the page in the middle of their work.
  registerType: 'prompt',
  includeAssets: ['favicon.png', 'apple-touch-icon-180x180.png'],
  manifest: {
    name: 'FM Stats Analyst',
    short_name: 'FM Stats',
    description:
      'A scouting table for Football Manager player exports: custom metrics, views and filters.',
    lang: 'en-GB',
    display: 'standalone',
    theme_color: BACKGROUND,
    background_color: BACKGROUND,
    icons: [
      { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
    // Control the page as soon as the first worker is installed, so demo files and fonts loaded
    // on the first visit are cached too. Updates still wait for the prompt.
    clientsClaim: true,
    runtimeCaching: [
      // Demo files and the FM view (public/data): too big to precache, kept once downloaded.
      {
        urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.includes('/data/'),
        handler: 'NetworkFirst',
        options: { cacheName: 'demo-data' },
      },
      // Roboto Condensed from Google Fonts, so the app looks the same offline.
      {
        urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
        handler: 'StaleWhileRevalidate',
        options: { cacheName: 'google-fonts-css' },
      },
      {
        urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts',
          expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
    ],
  },
})

// https://vite.dev/config/
export default defineConfig({
  // Path the app is served from: '/' locally, '/<repository>/' on GitHub Pages (set by the
  // deploy workflow).
  base: process.env.BASE_PATH || '/',
  plugins: [vue(), vueDevTools(), pwa],
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `
          @use '@/assets/scss/variables' as *;
          @use '@/assets/scss/shared';
        `,
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
