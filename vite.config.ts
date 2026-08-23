import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves a project site from /<repo>/, so the app has to be built
// with that prefix. Everything that loads data or fonts goes through
// import.meta.env.BASE_URL, so setting this is all that is needed.
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon-32.png', 'favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Dust Compass',
        short_name: 'Dust Compass',
        description: 'A free, offline-first map, event guide, and compass for the playa.',
        theme_color: '#12100e',
        background_color: '#12100e',
        display: 'standalone',
        orientation: 'any',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Everything the map needs has to be on the device before anyone leaves
        // pavement: the shell, the worker, the listings and the glyphs. There is
        // no runtime caching strategy here on purpose — a cache that fills as
        // you browse is useless when you are already in the desert.
        globPatterns: ['**/*.{js,css,html,svg,png,json,geojson,pbf}'],
        // event.json alone is ~4MB; the default 2MB cap would silently skip it.
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: `${base}index.html`,
      },
      devOptions: { enabled: false },
    }),
  ],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    // MapLibre is ~1MB on its own — it is a full WebGL renderer, not bloat.
    // Warn above that, so the threshold still means something.
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        // Split the three big dependencies apart. They change on entirely
        // different schedules to the app, so a rebuild should not force a
        // 1.5MB re-download over playa wifi at the gate.
        // Rolldown (Vite 8) takes manualChunks as a function only.
        manualChunks(id: string) {
          if (id.includes('maplibre') || id.includes('pmtiles')) return 'maplibre'
          if (id.includes('@mui') || id.includes('@emotion')) return 'mui'
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react'
          return undefined
        },
      },
    },
  },
})
