import type { ServiceCategory } from '../brc/services'

export interface PlayaImage {
  thumbnail_url?: string
  gallery_ref?: string
}

export interface ApiLocation {
  hour?: number
  minute?: number
  distance?: number
  category?: string
  frontage?: string
  intersection?: string
  intersection_type?: string
  dimensions?: string
  exact_location?: string
  gps_latitude?: number
  gps_longitude?: number
}

export interface ArtItem {
  uid: string
  name: string
  year: number
  artist?: string
  category?: string
  program?: string
  description?: string
  url?: string
  hometown?: string
  location?: ApiLocation
  location_string?: string
  images?: PlayaImage[]
}

export interface CampItem {
  uid: string
  name: string
  year: number
  description?: string
  landmark?: string
  hometown?: string
  contact_email?: string
  location?: ApiLocation
  location_string?: string
  images?: PlayaImage[]
}

export interface Occurrence {
  start_time: string
  end_time: string
}

export interface EventItem {
  uid: string
  title: string
  event_id: number
  description?: string
  print_description?: string
  event_type?: { label: string; abbr: string }
  year: number
  hosted_by_camp?: string | null
  located_at_art?: string | null
  other_location?: string
  all_day?: boolean
  occurrence_set: Occurrence[]
}

/**
 * `service` and `landmark` come from the survey rather than the listings API:
 * ranger stations, medical, ice, toilets, the Man, the portals. They are drawn
 * by their own layers, but they are places a person taps and asks about, so
 * they are the same kind of thing as a camp everywhere downstream of the map.
 */
export type PoiKind = 'art' | 'camp' | 'event' | 'service' | 'landmark'

/**
 * A listing the app knows about but cannot put on the map.
 *
 * Before Gates every art location is withheld, so all of it lands here — the
 * names, the artists and the descriptions are not embargoed and are exactly
 * what someone planning a week is looking for. A handful of camps land here
 * too, having published no location at all. Deliberately not a `Poi`: it has
 * no position, and the map should not be able to reach for one.
 */
export interface UnplacedListing {
  uid: string
  kind: 'art' | 'camp'
  name: string
  subtitle?: string
  description?: string
  thumbnail?: string
  /** Withheld under the licence, or simply never filed. They read differently. */
  /**
   * `stale` is the one that is not about the listing: the locations are out,
   * and this copy of the data was saved before they were. It is what a phone
   * that went to the playa before Gates will say about every art piece on it.
   */
  reason: 'embargoed' | 'unpublished' | 'stale'
}

/**
 * How sure the app can actually be that `position` is where the thing is.
 *
 * `positionSource` below says only how the *coordinate* was obtained — GPS
 * fields vs. a geocoded address — and that conflates two different Burning
 * Man data products behind the same word. The GIS survey's civic points
 * (rangers, toilets, portals) really are surveyed. Camp/art `gps_latitude`/
 * `gps_longitude` is a real coordinate too, but Burning Man's own API
 * documentation describes it as best-effort and published ahead of
 * Placement actually finishing — a camp can still move after that. Treating
 * both as equally exact (#61) let the app drop the approximation caveat
 * the moment any GPS field existed, regardless of which of these it was.
 */
export type PositionAccuracy = 'surveyed' | 'published' | 'derived'

/** A camp, art piece or surveyed civic place resolved to a map position. */
export interface Poi {
  uid: string
  kind: PoiKind
  name: string
  subtitle?: string
  description?: string
  address?: string
  position: [number, number]
  /** GPS is a coordinate field on the record; address means the pin is a geocoded street intersection. */
  positionSource: 'gps' | 'address'
  /** How much that coordinate is actually worth trusting — see `PositionAccuracy`. */
  accuracyClass: PositionAccuracy
  thumbnail?: string
  /** Services only: which coarse kind, so search and icons can tell them apart. */
  category?: ServiceCategory
}
