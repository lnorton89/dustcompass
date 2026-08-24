import { CATEGORY_LABEL, CATEGORY_NOTE, NON_SERVICE_CATEGORIES, type ServiceCategory } from '../brc/services'
import { reverseGeocode } from '../brc/geocode'
import type { CityLayout } from '../brc/layout'
import type { Poi } from './types'

/**
 * The survey's own places — rangers, medical, ice, toilets, the Man, the
 * portals — as listings.
 *
 * They are drawn by their own map layers and always have been, but until they
 * existed as `Poi`s there was nothing for a tap on one to select: the drawer,
 * the deep link and the "take me there" route all key off a uid. Nothing here
 * is rendered twice — the poi source only draws the kinds the filter chips can
 * switch on, and those are camps and art.
 */
export function civicPois(
  layout: CityLayout,
  services: GeoJSON.FeatureCollection<GeoJSON.Point>,
  toilets: GeoJSON.FeatureCollection<GeoJSON.Point>,
  landmarks: GeoJSON.FeatureCollection<GeoJSON.Point>,
): Poi[] {
  return [
    ...services.features.map((feature) => toPoi(layout, feature, 'service')),
    ...toilets.features.map((feature) => toPoi(layout, feature, 'service')),
    ...landmarks.features.map((feature) => toPoi(layout, feature, 'landmark')),
  ].filter((poi): poi is Poi => Boolean(poi))
}

/**
 * The survey gives a name and a coordinate, so anything more has to be said
 * here. Only where there is something true to say: a portal gets nothing,
 * because what this repo knows about one is its name and where it is, and both
 * are already on the screen above.
 */
function note(name: string, category: ServiceCategory | undefined): string | undefined {
  // Not by uid: the Man is `landmark:man` here and a survey point elsewhere,
  // and the sentence is true of whichever one the tap landed on.
  if (name === 'The Man') {
    return 'The centre of the city. Every playa address is measured from here.'
  }
  return category ? CATEGORY_NOTE[category] : undefined
}

function toPoi(
  layout: CityLayout,
  feature: GeoJSON.Feature<GeoJSON.Point>,
  kind: 'service' | 'landmark',
): Poi | undefined {
  const properties = (feature.properties ?? {}) as {
    uid?: unknown
    name?: unknown
    category?: unknown
  }
  const { uid, name } = properties
  if (typeof uid !== 'string' || typeof name !== 'string') return undefined

  const category =
    typeof properties.category === 'string'
      ? (properties.category as ServiceCategory)
      : undefined
  const position = feature.geometry.coordinates as [number, number]
  const address = reverseGeocode(position, layout)

  return {
    uid,
    kind,
    name,
    // "Civic" says nothing a person could not read off the name, and a bank
    // of toilets called "Toilets" does not need telling twice. Rangers,
    // medical and ice are worth spelling out under a name that hides them —
    // "Rampart", "Ice Nine Arctica". landmark/arrival/info are excluded here
    // too, but for the opposite reason: the kind chip itself now shows that
    // label (see DetailDrawer's kindLabel()), so repeating it as a subtitle
    // would just say "Landmark" twice.
    subtitle: category && category !== 'civic' && category !== 'toilet' && !NON_SERVICE_CATEGORIES.has(category)
      ? CATEGORY_LABEL[category]
      : undefined,
    // The Man sits at the origin every address is measured from, so it has
    // none of its own — "12:00 & 0'" would be noise dressed as information.
    address: address.distanceFeet > 0 ? address.label : undefined,
    description: note(name, category),
    position,
    // Surveyed coordinates, not a clock address geocoded back to a street
    // corner, so the pin is where the thing actually is.
    positionSource: 'gps',
    // The GIS survey's own civic points, genuinely surveyed — unlike a
    // camp/art record's API-published GPS, which is best-effort (#61).
    accuracyClass: 'surveyed',
    category,
  }
}
