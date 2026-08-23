import { bearingBetween, destination, distanceBetween, type Position } from './geo'

export interface Viewport {
  width: number
  height: number
  /** Padding in CSS pixels kept clear on every side. */
  padding?: number
}

export interface Frame {
  center: Position
  zoom: number
}

/** Web Mercator ground resolution at zoom 0, metres per pixel at the equator. */
const EQUATOR_METERS_PER_PIXEL = 156543.03392

/**
 * Frame a set of points for a map that is rotated to `bearing`.
 *
 * `fitBounds` fits an axis-aligned latitude/longitude box, which is the wrong
 * shape once the camera is rotated: containing a square rotated 45° needs about
 * 1.4× the room, so the city ends up floating in the middle of the screen with
 * a third of the viewport wasted top and bottom. Measuring the extent along the
 * screen's own axes instead gives a tight fit at any rotation or aspect ratio.
 */
export function frameFor(
  points: Position[],
  origin: Position,
  bearing: number,
  viewport: Viewport,
): Frame | undefined {
  if (points.length === 0) return undefined

  // Project every point onto the screen's axes, in metres, relative to origin.
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  for (const point of points) {
    const distance = distanceBetween(origin, point)
    const angle = ((bearingBetween(origin, point) - bearing) * Math.PI) / 180
    const x = distance * Math.sin(angle)
    const y = distance * Math.cos(angle)
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }

  const padding = viewport.padding ?? 0
  const usableWidth = Math.max(1, viewport.width - padding * 2)
  const usableHeight = Math.max(1, viewport.height - padding * 2)

  // The centre of the extent, expressed back as a real position.
  const offsetX = (minX + maxX) / 2
  const offsetY = (minY + maxY) / 2
  const offsetDistance = Math.hypot(offsetX, offsetY)
  const center =
    offsetDistance < 0.5
      ? origin
      : destination(
          origin,
          offsetDistance,
          bearing + (Math.atan2(offsetX, offsetY) * 180) / Math.PI,
        )

  const metersPerPixel = Math.max(
    (maxX - minX) / usableWidth,
    (maxY - minY) / usableHeight,
  )
  if (!(metersPerPixel > 0)) return { center, zoom: 16 }

  const latitudeScale = Math.cos((center[1] * Math.PI) / 180)
  const zoom = Math.log2((EQUATOR_METERS_PER_PIXEL * latitudeScale) / metersPerPixel)

  return { center, zoom }
}

/** Every vertex of the built city, for framing. */
export function cityOutlinePoints(
  streets: GeoJSON.FeatureCollection<GeoJSON.LineString>,
): Position[] {
  return streets.features.flatMap((street) => street.geometry.coordinates as Position[])
}
