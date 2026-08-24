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
  reason: 'embargoed' | 'unpublished'
}

/** A camp, art piece or surveyed civic place resolved to a map position. */
export interface Poi {
  uid: string
  kind: PoiKind
  name: string
  subtitle?: string
  description?: string
  address?: string
  position: [number, number]
  /** GPS is a surveyed point; address means the pin is the shared street intersection. */
  positionSource: 'gps' | 'address'
  thumbnail?: string
  /** Services only: which coarse kind, so search and icons can tell them apart. */
  category?: ServiceCategory
}
