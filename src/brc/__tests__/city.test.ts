import { describe, expect, it } from 'vitest'
import type { CityLayout } from '../layout'
import { buildCity } from '../city'
import { distanceBetween, metersToFeet, type Position } from '../geo'

/**
 * A minimal synthetic layout — not the real survey — just enough shape to
 * exercise buildCity() without depending on a fetched year's data.
 */
function baseLayout(): CityLayout {
  return {
    center: {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [-119.2, 40.78] },
    },
    bearing: 45,
    fence_distance: 10000,
    road_width: 40,
    cStreets: [
      { ref: 'esplanade', name: 'Esplanade', distance: 2500, segments: [['2:00', '10:00']] },
    ],
    tStreets: [],
    plazas: [],
    portals: [],
  }
}

describe('dmz', () => {
  it('renders a band of features at roughly the right radius when the survey supplies one', () => {
    const layout: CityLayout = {
      ...baseLayout(),
      dmz: { distance: 2400, depth: 100, segments: [['2:00', '4:00'], ['8:00', '10:00']] },
    }
    const city = buildCity(layout)
    expect(city.dmz.features).toHaveLength(2)

    const center = layout.center.geometry.coordinates as Position
    for (const feature of city.dmz.features) {
      expect(feature.geometry.type).toBe('Polygon')
      const ring = feature.geometry.coordinates[0]
      // Every vertex of the band should sit between the inner and outer radii.
      for (const point of ring) {
        const feet = metersToFeet(distanceBetween(center, point as Position))
        expect(feet).toBeGreaterThanOrEqual(2400 - 1)
        expect(feet).toBeLessThanOrEqual(2500 + 1)
      }
      // And it should actually span the band, not collapse to the inner edge.
      const farthest = Math.max(
        ...ring.map((point) => metersToFeet(distanceBetween(center, point as Position))),
      )
      expect(farthest).toBeGreaterThan(2490)
    }
  })

  it('produces no features when the survey has no DMZ', () => {
    const city = buildCity(baseLayout())
    expect(city.dmz.features).toEqual([])
  })
})

describe('entranceRoad', () => {
  it('renders the surveyed gate-road geometry verbatim, curves and all', () => {
    // A curved, two-segment gate road, as the real survey publishes it —
    // not a distance/angle pair that this function would have to synthesize
    // a straight line from.
    const lineA: Position[] = [
      [-119.21, 40.795],
      [-119.207, 40.7925],
      [-119.204, 40.79],
    ]
    const lineB: Position[] = [
      [-119.2105, 40.7952],
      [-119.2075, 40.7927],
    ]
    const layout: CityLayout = {
      ...baseLayout(),
      entrance_road: { lines: [lineA, lineB] },
    }
    const city = buildCity(layout)
    expect(city.entranceRoad.features).toHaveLength(2)

    // The rendered coordinates are exactly the surveyed ones — no bearing
    // math, no synthesized half-length, no lost intermediate vertices.
    expect(city.entranceRoad.features[0].geometry.coordinates).toEqual(lineA)
    expect(city.entranceRoad.features[1].geometry.coordinates).toEqual(lineB)
    for (const feature of city.entranceRoad.features) {
      expect(feature.geometry.type).toBe('LineString')
      expect(feature.properties?.kind).toBe('entrance-road')
    }
  })

  it('produces no features when the survey has no entrance road', () => {
    const city = buildCity(baseLayout())
    expect(city.entranceRoad.features).toEqual([])
  })
})
