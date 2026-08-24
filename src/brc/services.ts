import * as turf from '@turf/turf'

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
 * "where is a toilet", "where is medical" and "where is a ranger" — but the
 * CPNS survey also names plenty of places that are not infrastructure to seek
 * out in an emergency at all (The Temple, the airport, Box Office), and lumping
 * those into a `civic` catch-all is what made them read as medical/ranger
 * stations downstream (issue #43). `landmark`, `arrival` and `info` pull the
 * known cases out of `civic`; `civic` remains the honest "we don't know" bucket
 * for anything the patterns below don't recognise.
 */
export type ServiceCategory =
  | 'medical'
  | 'ranger'
  | 'toilet'
  | 'ice'
  | 'landmark'
  | 'arrival'
  | 'info'
  | 'civic'

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
  landmark: 'Landmark',
  arrival: 'Arrival',
  info: 'Info',
  civic: 'Civic',
}

/**
 * What the place is for, in one line.
 *
 * These are the app's own words, not the API's — the survey publishes a name
 * and a coordinate and nothing else, so a ranger station opened with an empty
 * panel under it. Kept to what is plainly true of the category: a station's
 * own name already says which one it is.
 *
 * Nothing here for `civic`, `landmark`, `arrival` or `info`. "The Temple",
 * "Box Office" and "Airport" explain themselves, and a line restating the
 * name is worse than none.
 */
export const CATEGORY_NOTE: Partial<Record<ServiceCategory, string>> = {
  ranger: 'Black Rock Rangers — non-confrontational help. Mediation, welfare checks, and where to report someone missing.',
  medical: 'Emergency medical care.',
  ice: 'Bagged ice, sold here.',
  toilet: 'Portable toilets. Nothing but paper goes in them — everything else is MOOP.',
}

export function categorise(name: string): ServiceCategory {
  const label = name.toLowerCase()
  // ESD is Burning Man's Emergency Services Department; Rampart is the field
  // hospital. Neither word contains "medical", and both are where you go.
  if (/esd station|rampart|medical|clinic|first aid/.test(label)) return 'medical'
  if (/ranger/.test(label)) return 'ranger'
  if (/arctica|\bice\b/.test(label)) return 'ice'
  // The Temple and named deep-playa reference points (e.g. "DMZ2") are places
  // to visit, not infrastructure to seek out in an emergency — grouping them
  // with medical/ranger stations under a generic "service" was issue #43.
  if (/\btemple\b|\bdmz/.test(label)) return 'landmark'
  // Where you enter, leave, park or check in: gates, will-call and parking
  // lots, the census checkpoint, the airport, the bus depot. "Gate" and
  // "transport" are kept as one category — a visitor asking "how do I get in
  // or out" doesn't care which of the two it is.
  if (/\bgate\b|\blot\b|box office|checkpoint|airport|burner express|\bbus\b/.test(label)) {
    return 'arrival'
  }
  // Participant-facing info and services (bike loans, vehicle rules, walk-in
  // camping) that read as "ask a question here", not "emergency here".
  if (/yellow bike|mutant vehicle|\bdmv\b|walk-in camp/.test(label)) return 'info'
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
  const named = features
    .filter((place) => place.properties?.NAME && !NOT_A_SERVICE.test(place.properties.NAME))
    .filter((place) => place.geometry?.type === 'Point')

  // Two stations can carry the same name in a survey, and a uid that collides
  // sends the second one's detail drawer to the first one's dot. The suffix
  // used to be assigned by encounter order in the source array, so a reordered
  // survey refresh silently reassigned every duplicate's uid — a shared link
  // or a favourite would start resolving to a different physical station with
  // no sign anything had changed. Sorting by coordinate first makes the Nth
  // station at a given name always the same physical one, survey order or not.
  const byName = new Map<string, SurveyedPlace[]>()
  for (const place of named) {
    const ref = slug(place.properties.NAME as string)
    const group = byName.get(ref)
    if (group) group.push(place)
    else byName.set(ref, [place])
  }
  const suffixOf = new Map<SurveyedPlace, number>()
  for (const group of byName.values()) {
    if (group.length < 2) continue
    const ordered = [...group].sort((a, b) => coordinateKey(a).localeCompare(coordinateKey(b)))
    ordered.forEach((place, i) => suffixOf.set(place, i + 1))
  }

  return {
    type: 'FeatureCollection',
    features: named.map((place) => {
      const name = place.properties.NAME as string
      const ref = slug(name)
      const suffix = suffixOf.get(place)
      return {
        type: 'Feature' as const,
        properties: {
          kind: 'service',
          uid: suffix && suffix > 1 ? `${SERVICE_UID}${ref}-${suffix}` : `${SERVICE_UID}${ref}`,
          name,
          ref,
          category: categorise(name),
        },
        geometry: { type: 'Point' as const, coordinates: place.geometry.coordinates },
      }
    }),
  }
}

/**
 * 5 decimal places is about 1.1m at Black Rock City's latitude — far finer
 * than two genuinely distinct stations of the same name would ever sit apart,
 * but coarse enough to ignore the trailing-digit noise a GeoJSON re-export can
 * introduce without the station having moved.
 */
function coordinateKey(place: SurveyedPlace): string {
  const [lng, lat] = place.geometry.coordinates
  return `${lng.toFixed(5)},${lat.toFixed(5)}`
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
    features: toilets.features.flatMap((feature, index): GeoJSON.Feature<GeoJSON.Point>[] => {
      const sourceId = feature.properties?.OBJECTID ?? index
      const point = (coordinates: GeoJSON.Position, uid: string): GeoJSON.Feature<GeoJSON.Point> => ({
        type: 'Feature',
        properties: {
          kind: 'service',
          uid,
          category: 'toilet' as const,
          name: 'Toilets',
        },
        geometry: { type: 'Point', coordinates },
      })

      if (feature.geometry?.type === 'Point') {
        return [point(feature.geometry.coordinates, `${TOILET_UID}${sourceId}`)]
      }
      if (feature.geometry?.type === 'Polygon') {
        const at = polygonPoint(feature.geometry.coordinates)
        return at ? [point(at, `${TOILET_UID}${sourceId}`)] : []
      }
      if (feature.geometry?.type === 'MultiPolygon') {
        // A survey feature can group several physically separate toilet banks
        // into one MultiPolygon. Collapsing that to a single point (the old
        // behaviour) silently dropped every bank but the first; a marker per
        // part keeps them all reachable, each with its own stable id.
        return feature.geometry.coordinates
          .map((rings, part): GeoJSON.Feature<GeoJSON.Point> | undefined => {
            const at = polygonPoint(rings)
            return at ? point(at, `${TOILET_UID}${sourceId}-${part + 1}`) : undefined
          })
          .filter((f): f is GeoJSON.Feature<GeoJSON.Point> => Boolean(f))
      }
      return []
    }),
  }
}

/**
 * A representative point for one polygon part of a toilet bank. Averaging the
 * ring's vertices (the old approach) is not a centroid at all — it is skewed
 * by however densely the survey happened to place vertices, and for an
 * L-shaped or otherwise concave bank it can land outside the polygon
 * entirely. `pointOnFeature` instead guarantees a point that actually lies on
 * the surface it describes, which matters more here than the exact area
 * centroid would: a toilet marker off the polygon can point at open playa.
 */
function polygonPoint(rings: GeoJSON.Position[][]): GeoJSON.Position | undefined {
  if (!rings.length || rings[0].length < 4) return undefined
  return turf.pointOnFeature(turf.polygon(rings)).geometry.coordinates
}
