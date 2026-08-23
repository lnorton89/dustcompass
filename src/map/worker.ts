import { setWorkerUrl } from 'maplibre-gl'
// Vite bundles the worker and its shared chunk into one emitted asset and hands
// back the hashed URL. `?worker&url` (not a bare `?url`) matters: the worker
// module imports maplibre-gl-shared.mjs relative to itself, which would 404 if
// the file were merely copied.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

/**
 * MapLibre GL JS v6 is ESM-only and resolves its worker as a sibling file of
 * `import.meta.url`. Once a bundler emits the library as a hashed chunk that
 * sibling no longer exists, so the worker 404s — and because every GeoJSON
 * source is parsed in the worker, the map paints its background and then
 * silently never fires `load`.
 *
 * Pointing MapLibre at the bundled worker fixes it. Must run before the first
 * Map is constructed.
 */
setWorkerUrl(workerUrl)
