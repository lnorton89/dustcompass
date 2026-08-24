import type { CityLayout } from './layout'
import { destination, feetToMeters, type Position } from './geo'

/**
 * The desert the city sits on, drawn rather than photographed.
 *
 * Zoomed out, a flat fill tells you nothing: the city floats in a void and
 * there is no sense of the basin, the ranges around it, or which way the open
 * playa runs. A satellite tile would say all of that, but there is no tile
 * server out here and no network to reach one — so the ground is generated the
 * same way the city is, from a handful of numbers, and drawn as vectors that
 * stay sharp at every zoom and cost nothing to ship.
 *
 * It is scenery, not survey. The basin outline, the ranges and the tracks are
 * shaped to read like Black Rock Desert from above — the playa opening south
 * toward Gerlach, ranges close on the east and west — but no coordinate here is
 * surveyed and nothing in the app navigates by it. Everything the app answers
 * questions with comes from `layout.json` and the listings.
 */

/** Deterministic and cheap: the same ground everywhere, on every device. */
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Sum a few sinusoids for an outline that wanders without looking random. */
function wobble(turns: number, phases: readonly number[]): number {
  let total = 0
  for (let i = 0; i < phases.length; i += 1) {
    const harmonic = i + 2
    total += Math.sin(turns * harmonic * Math.PI * 2 + phases[i]) / harmonic
  }
  return total
}

const ring = (
  centre: Position,
  steps: number,
  radiusAt: (turns: number) => number,
): Position[] => {
  const points: Position[] = []
  for (let i = 0; i < steps; i += 1) {
    const turns = i / steps
    points.push(destination(centre, radiusAt(turns), turns * 360))
  }
  points.push(points[0])
  return points
}

const polygon = (
  coordinates: Position[][],
  properties: GeoJSON.GeoJsonProperties,
): GeoJSON.Feature<GeoJSON.Polygon> => ({
  type: 'Feature',
  properties,
  geometry: { type: 'Polygon', coordinates },
})

export interface PlayaScenery {
  /** The alkali flat itself. */
  basin: GeoJSON.FeatureCollection<GeoJSON.Polygon>
  /** Broad tonal variation across the flat, as it looks from above. */
  patches: GeoJSON.FeatureCollection<GeoJSON.Polygon>
  /** Vehicle tracks worn across the open playa. */
  tracks: GeoJSON.FeatureCollection<GeoJSON.LineString>
  /** The ranges standing around the basin. */
  ranges: GeoJSON.FeatureCollection<GeoJSON.Polygon>
}

/** Metres from the Man to the far edge of the scenery. */
export const SCENE_RADIUS_METERS = 15000

export function buildPlaya(layout: CityLayout, seed = 20260830): PlayaScenery {
  const centre = layout.center.geometry.coordinates as Position
  const random = seeded(seed)
  const phases = Array.from({ length: 5 }, () => random() * Math.PI * 2)
  const fenceMeters = feetToMeters(layout.fence_distance)

  // The flat: a wide, softly irregular pan. It has to clear the trash fence
  // comfortably or the city appears to sit on the shoreline.
  const basinRadius = (turns: number) => 11200 + wobble(turns, phases.slice(0, 3)) * 2100
  const basin = polygon([ring(centre, 220, basinRadius)], { kind: 'basin' })

  // Tone. A playa photographs as a dozen shades of the same pale grey — old
  // water margins, silt, wind-scoured patches — never as one flat colour.
  const patches: GeoJSON.Feature<GeoJSON.Polygon>[] = []
  for (let i = 0; i < 14; i += 1) {
    const bearing = random() * 360
    const distance = fenceMeters * 0.55 + random() * 8200
    const at = destination(centre, distance, bearing)
    const size = 1100 + random() * 3400
    const local = Array.from({ length: 4 }, () => random() * Math.PI * 2)
    patches.push(
      polygon([ring(at, 48, (turns) => size * (1 + wobble(turns, local) * 0.32))], {
        kind: 'patch',
        // Two tones so the flat reads as mottled rather than blotched.
        tone: i % 3 === 0 ? 'pale' : 'shade',
      }),
    )
  }

  // Tracks. Everything that drives in leaves a line, and from above they are
  // the most legible thing on the playa after the city itself.
  const tracks: GeoJSON.Feature<GeoJSON.LineString>[] = []
  for (let i = 0; i < 9; i += 1) {
    const bearing = (i / 9) * 360 + random() * 18
    const from = fenceMeters * (0.7 + random() * 0.35)
    const to = 9000 + random() * 2600
    const steps = 14
    const line: Position[] = []
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps
      const drift = Math.sin(t * Math.PI * (1.5 + random() * 0.4)) * (140 + random() * 220)
      line.push(destination(centre, from + (to - from) * t, bearing + drift / 90))
    }
    tracks.push({
      type: 'Feature',
      properties: { kind: 'track' },
      geometry: { type: 'LineString', coordinates: line },
    })
  }

  // The ranges. Black Rock Desert is a basin: mountains close on most sides,
  // and the playa runs away south toward Gerlach. Leaving that quarter open is
  // the one thing that makes the picture read as this desert and not any other.
  const ranges: GeoJSON.Feature<GeoJSON.Polygon>[] = []
  const OPEN_FROM = 140
  const OPEN_TO = 215
  for (let i = 0; i < 7; i += 1) {
    const from = (i / 7) * 360
    const to = ((i + 1) / 7) * 360 - 4
    if (from > OPEN_FROM && to < OPEN_TO) continue

    const outer: Position[] = []
    const inner: Position[] = []
    const steps = 90
    const local = Array.from({ length: 3 }, () => random() * Math.PI * 2)
    const reach = 900 + random() * 500
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps
      const bearing = from + (to - from) * t
      // A range front is a long curve with a few summits on it, not a saw.
      // The ends taper back so neighbouring ranges meet in passes rather than
      // in a continuous wall.
      const taper = Math.sin(t * Math.PI) ** 0.6
      const crest = 12250 - taper * reach - wobble(t * 1.15, local) * 260 * taper
      outer.push(destination(centre, SCENE_RADIUS_METERS, bearing))
      inner.push(destination(centre, crest, bearing))
    }
    ranges.push(polygon([[...outer, ...inner.reverse(), outer[0]]], { kind: 'range' }))
  }

  const fc = <T extends GeoJSON.Geometry>(
    features: GeoJSON.Feature<T>[],
  ): GeoJSON.FeatureCollection<T> => ({ type: 'FeatureCollection', features })

  return {
    basin: fc([basin]),
    patches: fc(patches),
    tracks: fc(tracks),
    ranges: fc(ranges),
  }
}
