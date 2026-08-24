/**
 * Survey places carry no id of their own, so one is minted from the name. The
 * prefixes keep them clear of the listing uids they share an index with, and
 * mark the links that have no share page behind them.
 */
export const SERVICE_UID = 'service:'
export const TOILET_UID = 'toilet:'

/** A named place as Burning Man's survey publishes it in `cpns.geojson`. */
export interface SurveyedPlace {
  properties: { NAME?: string; TYPE?: string }
  geometry: { type: 'Point'; coordinates: GeoJSON.Position }
}

/**
 * Icons are deliberately coarse. At 3am the only questions that matter are
 * "where is a toilet", "where is medical" and "where is a ranger".
 */
export type ServiceCategory = 'medical' | 'ranger' | 'toilet' | 'ice' | 'civic'

/**
 * Plazas, portals and promenades are already drawn from the layout, the Man is
 * already a landmark, and the numbered points are survey control marks rather
 * than anywhere a person goes.
 */
const NOT_A_SERVICE = /(plaza|portal|promenade)$|^point \d|^the man$/i

/** What the drawer calls a service when it has nothing else to say about it. */
export const CATEGORY_LABEL: Record<ServiceCategory, string> = {
  medical: 'Medical',
  ranger: 'Rangers',
  toilet: 'Toilets',
  ice: 'Ice',
  civic: 'Civic',
}

export function categorise(name: string): ServiceCategory {
  const label = name.toLowerCase()
  // ESD is Burning Man's Emergency Services Department; Rampart is the field
  // hospital. Neither word contains "medical", and both are where you go.
  if (/esd station|rampart|medical|clinic|first aid/.test(label)) return 'medical'
  if (/ranger/.test(label)) return 'ranger'
  if (/arctica|\bice\b/.test(label)) return 'ice'
  return 'civic'
}

/**
 * The survey gives these places real coordinates, so they are used as surveyed
 * rather than geocoded back from a clock address.
 */
export function buildServices(
  places: GeoJSON.FeatureCollection | { features: SurveyedPlace[] },
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const features = (places.features ?? []) as SurveyedPlace[]
  // Two stations can carry the same name in a survey, and a uid that collides
  // sends the second one's detail drawer to the first one's dot.
  const seen = new Map<string, number>()
  return {
    type: 'FeatureCollection',
    features: features
      .filter((place) => place.properties?.NAME && !NOT_A_SERVICE.test(place.properties.NAME))
      .filter((place) => place.geometry?.type === 'Point')
      .map((place) => {
        const name = place.properties.NAME as string
        const ref = slug(name)
        const taken = seen.get(ref) ?? 0
        seen.set(ref, taken + 1)
        return {
          type: 'Feature' as const,
          properties: {
            kind: 'service',
            uid: taken ? `${SERVICE_UID}${ref}-${taken + 1}` : `${SERVICE_UID}${ref}`,
            name,
            ref,
            category: categorise(name),
          },
          geometry: { type: 'Point' as const, coordinates: place.geometry.coordinates },
        }
      }),
  }
}

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** Toilet banks, normalised to points so they can share one symbol layer. */
export function toiletPoints(
  toilets: GeoJSON.FeatureCollection,
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: toilets.features
      .map((feature, index): GeoJSON.Feature<GeoJSON.Point> | undefined => {
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
          properties: {
            kind: 'service',
            uid: `${TOILET_UID}${feature.properties?.OBJECTID ?? index}`,
            category: 'toilet' as const,
            name: 'Toilets',
          },
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
