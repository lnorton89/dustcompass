import * as turf from '@turf/turf'
import { describe, expect, it } from 'vitest'
import { buildServices, categorise, SERVICE_UID, TOILET_UID, toiletPoints, type SurveyedPlace } from '../services'

/**
 * An L-shaped (concave) ring. Its vertices are unevenly spread — three of six
 * sit on the short top edge — so a plain vertex average is pulled toward that
 * cluster and lands in the notch the L cuts out of its bounding box: outside
 * the polygon entirely. That is the failure `pointOnFeature` exists to avoid.
 */
const CONCAVE_RING: GeoJSON.Position[] = [
  [0, 0],
  [10, 0],
  [10, 3],
  [3, 3],
  [3, 10],
  [0, 10],
  [0, 0],
]

const naiveVertexAverage = (ring: GeoJSON.Position[]): GeoJSON.Position => {
  const points = ring.slice(0, -1)
  const sum = points.reduce(([x, y], [lng, lat]) => [x + lng, y + lat], [0, 0])
  return [sum[0] / points.length, sum[1] / points.length]
}

describe('toiletPoints', () => {
  it('leaves a Point geometry as-is', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { OBJECTID: 7 },
          geometry: { type: 'Point', coordinates: [5, 5] },
        },
      ],
    }
    const points = toiletPoints(fc)
    expect(points.features).toHaveLength(1)
    expect(points.features[0].geometry.coordinates).toEqual([5, 5])
    expect(points.features[0].properties?.uid).toBe(`${TOILET_UID}7`)
  })

  it('picks a point that actually lands on a concave polygon, not the naive vertex average', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { OBJECTID: 1 },
          geometry: { type: 'Polygon', coordinates: [CONCAVE_RING] },
        },
      ],
    }
    const [feature] = toiletPoints(fc).features
    const at = feature.geometry.coordinates

    // The bug this replaces: the vertex average falls in the L's notch.
    const naive = naiveVertexAverage(CONCAVE_RING)
    expect(turf.booleanPointInPolygon(naive, turf.polygon([CONCAVE_RING]))).toBe(false)

    // The fix: the emitted point is different, and actually on the polygon.
    expect(at).not.toEqual(naive)
    expect(
      turf.booleanPointInPolygon(at, turf.polygon([CONCAVE_RING])) ||
        turf.booleanPointOnLine(at, turf.lineString(CONCAVE_RING)),
    ).toBe(true)
  })

  it('emits one marker per part of a MultiPolygon instead of dropping every part but the first', () => {
    const bankA: GeoJSON.Position[] = [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
      [0, 0],
    ]
    const bankB: GeoJSON.Position[] = [
      [100, 100],
      [102, 100],
      [102, 102],
      [100, 102],
      [100, 100],
    ]
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { OBJECTID: 42 },
          geometry: { type: 'MultiPolygon', coordinates: [[bankA], [bankB]] },
        },
      ],
    }

    const points = toiletPoints(fc).features
    expect(points).toHaveLength(2)

    const uids = points.map((f) => f.properties?.uid).sort()
    expect(uids).toEqual([`${TOILET_UID}42-1`, `${TOILET_UID}42-2`])

    // Each marker lands on its own bank, not merged into one shared point.
    const near = (a: GeoJSON.Position, b: GeoJSON.Position) =>
      Math.hypot(a[0] - b[0], a[1] - b[1]) < 3
    const atA = points.find((f) => f.properties?.uid === `${TOILET_UID}42-1`)!
    const atB = points.find((f) => f.properties?.uid === `${TOILET_UID}42-2`)!
    expect(near(atA.geometry.coordinates, [1, 1])).toBe(true)
    expect(near(atB.geometry.coordinates, [101, 101])).toBe(true)
  })
})

describe('buildServices', () => {
  const place = (name: string, coordinates: GeoJSON.Position): SurveyedPlace => ({
    properties: { NAME: name },
    geometry: { type: 'Point', coordinates },
  })

  // Chosen 0.0001 apart, well past the 5-decimal-place precision buildServices
  // keys duplicates on, so each is unambiguously its own station.
  const stationA = place('Ranger Outpost', [10.0, 20.0])
  const stationB = place('Ranger Outpost', [10.0001, 20.0])
  const stationC = place('Ranger Outpost', [10.0002, 20.0])

  const uidFor = (fc: GeoJSON.FeatureCollection<GeoJSON.Point>, coordinates: GeoJSON.Position) =>
    fc.features.find((f) => f.geometry.coordinates[0] === coordinates[0])?.properties?.uid

  it('assigns the same uid to a station regardless of source array order', () => {
    const forward = buildServices({ features: [stationA, stationB] })
    const reversed = buildServices({ features: [stationB, stationA] })

    expect(uidFor(forward, stationA.geometry.coordinates)).toBe(
      uidFor(reversed, stationA.geometry.coordinates),
    )
    expect(uidFor(forward, stationB.geometry.coordinates)).toBe(
      uidFor(reversed, stationB.geometry.coordinates),
    )
    // And the two duplicates are not left colliding on one uid.
    expect(uidFor(forward, stationA.geometry.coordinates)).not.toBe(
      uidFor(forward, stationB.geometry.coordinates),
    )
    expect(uidFor(forward, stationA.geometry.coordinates)).toMatch(
      new RegExp(`^${SERVICE_UID}ranger-outpost-[0-9a-z]+$`),
    )
  })

  // #46: a rank-based suffix (even one made order-independent by sorting on
  // coordinate first, as #30 did) still shifts every later station's uid
  // whenever a same-name station is inserted before or removed — a coordinate
  // -derived suffix must not, in either direction.
  it('keeps existing duplicates stable when another same-name station is added after them', () => {
    const before = buildServices({ features: [stationA, stationB] })
    const uidABefore = uidFor(before, stationA.geometry.coordinates)
    const uidBBefore = uidFor(before, stationB.geometry.coordinates)

    const after = buildServices({ features: [stationA, stationB, stationC] })
    expect(uidFor(after, stationA.geometry.coordinates)).toBe(uidABefore)
    expect(uidFor(after, stationB.geometry.coordinates)).toBe(uidBBefore)
    // The newcomer gets its own, still-unique uid.
    const uidC = uidFor(after, stationC.geometry.coordinates)
    expect(uidC).not.toBe(uidABefore)
    expect(uidC).not.toBe(uidBBefore)
    expect(new Set(after.features.map((f) => f.properties?.uid)).size).toBe(3)
  })

  it('keeps existing duplicates stable when a same-name station is inserted before them by coordinate', () => {
    // stationZ sorts before stationA by coordinateKey — exactly the ordering
    // that renumbered a rank-based scheme, since it becomes the new "first".
    const stationZ = place('Ranger Outpost', [9.9999, 20.0])

    const before = buildServices({ features: [stationA, stationB] })
    const uidABefore = uidFor(before, stationA.geometry.coordinates)
    const uidBBefore = uidFor(before, stationB.geometry.coordinates)

    const after = buildServices({ features: [stationZ, stationA, stationB] })
    expect(uidFor(after, stationA.geometry.coordinates)).toBe(uidABefore)
    expect(uidFor(after, stationB.geometry.coordinates)).toBe(uidBBefore)
    const uidZ = uidFor(after, stationZ.geometry.coordinates)
    expect(uidZ).not.toBe(uidABefore)
    expect(uidZ).not.toBe(uidBBefore)
  })

  it('does not renumber the surviving station when a same-name station is removed', () => {
    const before = buildServices({ features: [stationA, stationB, stationC] })
    const uidBBefore = uidFor(before, stationB.geometry.coordinates)
    const uidCBefore = uidFor(before, stationC.geometry.coordinates)

    const after = buildServices({ features: [stationB, stationC] })
    expect(uidFor(after, stationB.geometry.coordinates)).toBe(uidBBefore)
    expect(uidFor(after, stationC.geometry.coordinates)).toBe(uidCBefore)
  })

  // Issue #43: the CPNS survey names plenty of real places that are not
  // generic "civic services" — a landmark, arrival infrastructure, and
  // participant-facing info all used to fall into the same `civic` bucket as
  // an actual ranger/medical station, which is what sent them to the same
  // icon downstream. These pin the fix at the category level.
  describe('categorise (issue #43)', () => {
    it('classifies The Temple as a landmark, not a medical/ranger station', () => {
      expect(categorise('The Temple')).toBe('landmark')
    })

    it('classifies a named deep-playa reference point as a landmark', () => {
      expect(categorise('Deep-Playa Music Zone / DMZ2')).toBe('landmark')
    })

    it('classifies gate/arrival infrastructure as arrival, not civic', () => {
      expect(categorise('Gate Actual')).toBe('arrival')
      expect(categorise('Box Office')).toBe('arrival')
      expect(categorise('Will Call Lot')).toBe('arrival')
      expect(categorise('D Lot')).toBe('arrival')
      expect(categorise('Census Checkpoint')).toBe('arrival')
    })

    it('classifies transport as arrival', () => {
      expect(categorise('Airport')).toBe('arrival')
      expect(categorise('Burner Express Bus Depot')).toBe('arrival')
    })

    it('classifies participant services/info as info, not medical', () => {
      expect(categorise('Yellow Bike Project')).toBe('info')
      expect(categorise('Department of Mutant Vehicles')).toBe('info')
      expect(categorise('Walk-In Camp')).toBe('info')
    })

    it('still falls back to civic for an unrecognised name', () => {
      expect(categorise('Some Future Playa Thing')).toBe('civic')
    })
  })

  it('carries the new categories through into built service features', () => {
    const fc = buildServices({
      features: [
        place('The Temple', [0, 0]),
        place('Gate Actual', [1, 1]),
        place('Yellow Bike Project', [2, 2]),
        place('Some Future Playa Thing', [3, 3]),
      ],
    })
    const categoryOf = (name: string) =>
      fc.features.find((f) => f.properties?.name === name)?.properties?.category
    expect(categoryOf('The Temple')).toBe('landmark')
    expect(categoryOf('Gate Actual')).toBe('arrival')
    expect(categoryOf('Yellow Bike Project')).toBe('info')
    expect(categoryOf('Some Future Playa Thing')).toBe('civic')
    // Kept as `service`: promoting to a new `kind` would ripple into filters
    // and helpers (e.g. App.tsx's isCivic()) outside this fix's reach. The
    // richer `category` is what downstream UI now keys off instead.
    expect(fc.features.every((f) => f.properties?.kind === 'service')).toBe(true)
  })
})
