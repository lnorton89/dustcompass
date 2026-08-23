import type { CityLayout } from './layout'
import { polarToPosition } from './geo'

/** A named city service as it appears in the layout spec's poi.json. */
export interface ServiceSpec {
  properties: { name: string; ref: string }
  address: { time: string; distance: number }
}

/**
 * Icons are deliberately coarse. At 3am the only questions that matter are
 * "where is a toilet", "where is medical" and "where is a ranger".
 */
export type ServiceCategory = 'medical' | 'ranger' | 'toilet' | 'ice' | 'civic'

const CATEGORY: Record<string, ServiceCategory> = {
  emergencyclinic: 'medical',
  firstaid: 'medical',
  medical: 'medical',
  ranger: 'ranger',
  rangerhq: 'ranger',
  ice: 'ice',
  arctica: 'ice',
}

export function categorise(ref: string, name: string): ServiceCategory {
  const key = ref.toLowerCase()
  if (CATEGORY[key]) return CATEGORY[key]
  const label = name.toLowerCase()
  if (/ranger|station\s*\d/.test(label)) return 'ranger'
  if (/medical|clinic|rampart|first aid/.test(label)) return 'medical'
  if (/ice|arctica/.test(label)) return 'ice'
  return 'civic'
}

/** Geocode the named services from their clock addresses. */
export function buildServices(
  layout: CityLayout,
  specs: ServiceSpec[],
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: specs.map((spec) => ({
      type: 'Feature',
      properties: {
        kind: 'service',
        name: spec.properties.name,
        ref: spec.properties.ref,
        category: categorise(spec.properties.ref, spec.properties.name),
      },
      geometry: {
        type: 'Point',
        coordinates: polarToPosition(layout, spec.address.time, spec.address.distance),
      },
    })),
  }
}

/** Toilet banks, normalised to points so they can share one symbol layer. */
export function toiletPoints(
  toilets: GeoJSON.FeatureCollection,
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: toilets.features
      .map((feature): GeoJSON.Feature<GeoJSON.Point> | undefined => {
        let coordinates: GeoJSON.Position | undefined
        if (feature.geometry?.type === 'Point') {
          coordinates = feature.geometry.coordinates
        } else if (feature.geometry?.type === 'Polygon') {
          coordinates = ringCentre(feature.geometry.coordinates[0])
        } else if (feature.geometry?.type === 'MultiPolygon') {
          coordinates = ringCentre(feature.geometry.coordinates[0]?.[0] ?? [])
        }
        if (!coordinates) return undefined
        return {
          type: 'Feature',
          properties: { kind: 'service', category: 'toilet' as const, name: 'Toilets' },
          geometry: { type: 'Point', coordinates },
        }
      })
      .filter((feature): feature is GeoJSON.Feature<GeoJSON.Point> => Boolean(feature)),
  }
}

function ringCentre(ring: GeoJSON.Position[]): GeoJSON.Position | undefined {
  if (!ring.length) return undefined
  // The final coordinate closes a GeoJSON ring and duplicates the first.
  const points = ring.length > 1 ? ring.slice(0, -1) : ring
  const sum = points.reduce(([x, y], [lng, lat]) => [x + lng, y + lat], [0, 0])
  return [sum[0] / points.length, sum[1] / points.length]
}
