import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import type { CityLayout } from '../../brc/layout'
import { destination, distanceBetween, feetToMeters, type Position } from '../../brc/geo'
import { buildPlaya, SCENE_RADIUS_METERS } from '../../brc/playa'
import { DATA_YEAR } from '../../config'

const layout = JSON.parse(
  readFileSync(`public/data/${DATA_YEAR}/layout.json`, 'utf8'),
) as CityLayout
const centre = layout.center.geometry.coordinates as Position

describe('the drawn desert', () => {
  const scene = buildPlaya(layout)

  it('draws the same ground every time, on every device', () => {
    expect(JSON.stringify(buildPlaya(layout))).toBe(JSON.stringify(scene))
  })

  it('is different ground for a different seed', () => {
    expect(JSON.stringify(buildPlaya(layout, 1))).not.toBe(JSON.stringify(scene))
  })

  it('puts the whole city on the pan rather than on its shoreline', () => {
    const basin = scene.basin.features[0]
    // The trash fence is the outermost thing the city has; every corner of it
    // has to sit inside the flat, or the map shows Black Rock City on a beach.
    for (let i = 0; i < 5; i += 1) {
      const corner = destination(
        centre,
        feetToMeters(layout.fence_distance),
        (i * 360) / 5 + layout.bearing,
      )
      expect(
        booleanPointInPolygon(corner, basin),
        `fence corner ${i} is off the basin`,
      ).toBe(true)
    }
  })

  it('leaves the south open, the way the basin runs to Gerlach', () => {
    const towardGerlach = destination(centre, SCENE_RADIUS_METERS - 500, 175)
    const inRange = scene.ranges.features.some((range) =>
      booleanPointInPolygon(towardGerlach, range),
    )
    expect(inRange).toBe(false)
  })

  it('rings the rest of the basin with high ground', () => {
    for (const bearing of [0, 60, 90, 280, 320]) {
      const out = destination(centre, SCENE_RADIUS_METERS - 500, bearing)
      expect(
        scene.ranges.features.some((range) => booleanPointInPolygon(out, range)),
        `nothing standing at ${bearing}°`,
      ).toBe(true)
    }
  })

  it('keeps the tracks out on the open playa, clear of the city', () => {
    const fence = feetToMeters(layout.fence_distance)
    for (const track of scene.tracks.features) {
      const nearest = Math.min(
        ...track.geometry.coordinates.map((point) =>
          distanceBetween(centre, point as Position),
        ),
      )
      expect(nearest).toBeGreaterThan(fence * 0.6)
    }
  })

  it('costs kilobytes, not megabytes — it ships in the offline cache', () => {
    const bytes = JSON.stringify(scene).length
    expect(bytes).toBeLessThan(300_000)
  })
})
