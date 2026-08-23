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

export type PoiKind = 'art' | 'camp' | 'event'

/** A camp or art piece resolved to a map position. */
export interface Poi {
  uid: string
  kind: PoiKind
  name: string
  subtitle?: string
  description?: string
  address?: string
  position: [number, number]
  thumbnail?: string
}
