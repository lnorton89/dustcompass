import { addProtocol } from 'maplibre-gl'
import { Protocol } from 'pmtiles'

let registered = false

/**
 * Register the pmtiles:// protocol. A PMTiles archive is a single static file
 * read with HTTP range requests — no tile server, no API key, and it can be
 * precached whole for offline use. Call once before the first map mounts.
 *
 * Only needed if you add a surrounding-desert basemap; the city itself is
 * generated client-side and needs no tiles at all.
 *
 * Note: maplibre-gl v6 is ESM-only and has no default export, so this is a
 * named import rather than `maplibregl.addProtocol`.
 */
export function registerPmtiles() {
  if (registered) return
  const protocol = new Protocol()
  addProtocol('pmtiles', protocol.tile)
  registered = true
}
