import { describe, expect, it } from 'vitest'
import type { CityLayout } from '../../brc/layout'
import type { ArtItem, CampItem } from '../types'
import { toPois } from '../usePlayaData'

/**
 * #61: a camp/art record's `gps_latitude`/`gps_longitude` is a real
 * coordinate, but Burning Man's own API documentation describes it as
 * best-effort and published ahead of Placement finishing — a camp can still
 * move after that. `toPois()` used to label it `positionSource: 'gps'` with
 * nothing distinguishing it from the GIS survey's genuinely surveyed civic
 * points (see `civic.ts`), so the app's detail view dropped its
 * approximation caveat the moment any GPS field existed at all.
 */

const LAYOUT: CityLayout = {
  center: {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Point', coordinates: [-119.2032, 40.7864] },
  },
  bearing: 45,
  fence_distance: 10560,
  road_width: 40,
  cStreets: [{ ref: 'esplanade', name: 'Esplanade', distance: 2500, segments: [['2:00', '10:00']] }],
  // #52: intersectionExists() also requires a radial reaching this street's
  // radius at the requested clock, not just annular coverage.
  tStreets: [{ refs: ['6:00'], segments: [['esplanade', 3000]] }],
  plazas: [],
  portals: [],
}

const art = (overrides: Partial<ArtItem> = {}): ArtItem => ({
  uid: 'art-1',
  name: 'Test Art',
  year: 2026,
  ...overrides,
})

const camp = (overrides: Partial<CampItem> = {}): CampItem => ({
  uid: 'camp-1',
  name: 'Test Camp',
  year: 2026,
  ...overrides,
})

describe('toPois — accuracyClass (#61)', () => {
  it('labels API-published GPS as published, not surveyed', () => {
    const { pois } = toPois(
      LAYOUT,
      [art({ location: { gps_latitude: 40.787, gps_longitude: -119.204 } })],
      [],
      { artReleased: true, campsReleased: true },
    )
    expect(pois).toHaveLength(1)
    expect(pois[0].positionSource).toBe('gps')
    expect(pois[0].accuracyClass).toBe('published')
  })

  it('labels an address-derived pin as derived', () => {
    const { pois } = toPois(
      LAYOUT,
      [],
      [camp({ location_string: '6:00 & Esplanade' })],
      { artReleased: true, campsReleased: true },
    )
    expect(pois).toHaveLength(1)
    expect(pois[0].positionSource).toBe('address')
    expect(pois[0].accuracyClass).toBe('derived')
  })
})
