import { describe, expect, it } from 'vitest'
import { geocode } from '../../brc/geocode'
import type { CityLayout } from '../../brc/layout'
import type { Poi } from '../types'
import { directionsEndpointLabel, resolveDirectionsEndpoint, resolveDirectionsRoute } from '../directionsRuntime'

const layout: CityLayout = {
  center: {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Point', coordinates: [-119.2035, 40.7864] },
  },
  bearing: 45,
  fence_distance: 6000,
  road_width: 40,
  cStreets: [
    { ref: 'esplanade', name: 'Esplanade', distance: 2500, segments: [['2:00', '10:00']] },
  ],
  tStreets: [
    { refs: ['6:00'], segments: [[0, 'esplanade']] },
  ],
  plazas: [],
  portals: [],
}

const camp: Poi = {
  uid: 'camp-1',
  kind: 'camp',
  name: 'Test Camp',
  address: '6:00 & Esplanade',
  position: [-119.2035, 40.7795],
  positionSource: 'gps',
  accuracyClass: 'published',
}

const context = { layout, pois: [camp] }

describe('directions endpoint runtime resolution', () => {
  it('resolves the Man to the annual layout center', () => {
    expect(resolveDirectionsEndpoint({ kind: 'man' }, context)).toMatchObject({
      label: 'The Man',
      position: [-119.2035, 40.7864],
      dynamic: false,
      accuracy: 'exact',
    })
  })

  it('keeps Your location unresolved until a usable fix exists', () => {
    expect(resolveDirectionsEndpoint({ kind: 'live' }, context)).toBeUndefined()

    expect(
      resolveDirectionsEndpoint(
        { kind: 'live' },
        { ...context, livePosition: [-119.201, 40.782] },
      ),
    ).toMatchObject({
      label: 'Your location',
      position: [-119.201, 40.782],
      dynamic: true,
      accuracy: 'exact',
    })
  })

  it('resolves POIs by stable UID and preserves published-best-effort provenance (#137)', () => {
    expect(resolveDirectionsEndpoint({ kind: 'poi', uid: camp.uid }, context)).toMatchObject({
      label: camp.name,
      detail: camp.address,
      position: camp.position,
      accuracy: 'published',
    })
    expect(resolveDirectionsEndpoint({ kind: 'poi', uid: 'missing' }, context)).toBeUndefined()
  })

  it('distinguishes derived listing locations from surveyed/exact endpoints (#137)', () => {
    const derived: Poi = {
      ...camp,
      uid: 'camp-derived',
      name: 'Address-derived Camp',
      positionSource: 'address',
      accuracyClass: 'derived',
    }
    expect(resolveDirectionsEndpoint({ kind: 'poi', uid: derived.uid }, { layout, pois: [derived] })).toMatchObject({
      accuracy: 'approximate',
    })
  })

  it('trusts a serialized address coordinate only when it round-trips to that address (#134)', () => {
    const geocoded = geocode('6:00 & Esplanade', layout)
    expect(geocoded).toBeDefined()
    const exact = resolveDirectionsEndpoint(
      { kind: 'address', address: '6:00 & Esplanade', position: geocoded!.position },
      context,
    )
    expect(exact).toMatchObject({
      position: geocoded!.position,
      accuracy: 'exact',
      dynamic: false,
    })

    const contradictory = resolveDirectionsEndpoint(
      {
        kind: 'address',
        address: '6:00 & Esplanade',
        position: layout.center.geometry.coordinates as [number, number],
      },
      context,
    )
    expect(contradictory).toMatchObject({
      position: geocoded!.position,
      accuracy: 'exact',
      dynamic: false,
    })
    expect(contradictory?.position).not.toEqual(layout.center.geometry.coordinates)
  })

  it('rejects fixed shared endpoints outside the BRC navigation vicinity (#134)', () => {
    expect(
      resolveDirectionsEndpoint(
        { kind: 'fixed', label: 'Remote point', position: [-122.4194, 37.7749] },
        context,
      ),
    ).toBeUndefined()
  })

  it('accepts explicit fixed endpoints for reproducible planned routes', () => {
    const endpoint = {
      kind: 'fixed' as const,
      label: 'Meet here',
      position: [-119.2, 40.78] as [number, number],
    }
    expect(resolveDirectionsEndpoint(endpoint, context)).toMatchObject({
      endpoint,
      label: 'Meet here',
      position: [-119.2, 40.78],
      dynamic: false,
      accuracy: 'exact',
    })
  })

  it('resolves a complete route only when both endpoints are available', () => {
    expect(
      resolveDirectionsRoute(
        { kind: 'man' },
        { kind: 'poi', uid: camp.uid },
        context,
      ),
    ).toMatchObject({ from: { label: 'The Man' }, to: { label: 'Test Camp', accuracy: 'published' } })

    expect(
      resolveDirectionsRoute(
        { kind: 'live' },
        { kind: 'poi', uid: camp.uid },
        context,
      ),
    ).toBeUndefined()
  })

  it('gives unresolved POI links a truthful label', () => {
    expect(directionsEndpointLabel({ kind: 'poi', uid: 'missing' }, context.pois)).toBe('Unknown listing')
  })
})
