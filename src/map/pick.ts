import type { MapGeoJSONFeature } from 'maplibre-gl'

export interface ScreenPoint {
  x: number
  y: number
}

/**
 * Of everything a tap could have meant, the one anchored closest to it.
 *
 * A tap is fat and the things it lands on are small, so the map is asked about
 * a box rather than a pixel. That box routinely holds several answers — a
 * label belonging to one camp and the dot of another, or two camps sharing one
 * intersection — and the renderer's own order is not the one the person meant.
 * Distance from the tap to the feature's own anchor is.
 */
export function nearestFeature(
  features: MapGeoJSONFeature[],
  at: ScreenPoint,
  project: (position: [number, number]) => ScreenPoint,
): MapGeoJSONFeature | undefined {
  let closest: MapGeoJSONFeature | undefined
  let best = Infinity
  for (const feature of features) {
    if (!feature.properties?.uid || feature.geometry.type !== 'Point') continue
    const anchor = project(feature.geometry.coordinates as [number, number])
    const distance = Math.hypot(anchor.x - at.x, anchor.y - at.y)
    if (distance < best) {
      best = distance
      closest = feature
    }
  }
  return closest
}
