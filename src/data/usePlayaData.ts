import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CityLayout } from '../brc/layout'
import { buildCity, type CityGeometry } from '../brc/city'
import { buildServices, toiletPoints } from '../brc/services'
import { civicPois } from './civic'
import { frontagePosition } from '../brc/frontage'
import type { ArtItem, CampItem, EventItem, Poi, UnplacedListing } from './types'
import { applyEmbargo, embargoState, embargoWindowForYear, type EmbargoState } from './embargo'
import type { EventRange } from './events'
import { DATA_YEAR, assetUrl } from '../config'

/**
 * A dataset whose fetch failed and fell back to empty. `toilets`/`services`/
 * `dates` are safety- or schedule-relevant — silently showing a normal-
 * looking map with zero toilets, or a schedule with no event window because
 * `dates_info.json` never loaded, is worse than saying so. `outlines` is
 * cosmetic camp-block geometry and is not tracked: it can fail without the
 * user needing to know.
 */
export type PartialDataWarning = 'toilets' | 'services' | 'dates'

export interface PlayaData {
  layout: CityLayout
  city: CityGeometry
  art: ArtItem[]
  camps: CampItem[]
  events: EventItem[]
  pois: Poi[]
  /** Listings with no location to show — see `UnplacedListing`. */
  unplaced: UnplacedListing[]
  /** The event week these listings describe, used to anchor "what's on now". */
  range?: EventRange
  services: GeoJSON.FeatureCollection<GeoJSON.Point>
  toilets: GeoJSON.FeatureCollection<GeoJSON.Point>
  /** Surveyed camp block footprints, drawn at high zoom. */
  campOutlines: GeoJSON.FeatureCollection
  embargo: EmbargoState
  /** Safety/schedule-relevant datasets that failed to load this attempt. */
  partialDataWarnings: PartialDataWarning[]
}

function empty(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] }
}

async function loadJson<T>(path: string): Promise<T> {
  const response = await fetch(path)
  if (!response.ok) throw new Error(`${path}: ${response.status} ${response.statusText}`)
  return response.json() as Promise<T>
}

export function usePlayaData() {
  const [data, setData] = useState<PlayaData>()
  const [error, setError] = useState<Error>()
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => {
    setError(undefined)
    setData(undefined)
    setAttempt((current) => current + 1)
  }, [])

  /**
   * Shared by the initial/retry load and the silent background refresh
   * below. `clear` decides whether to blank the screen back to the loading
   * spinner first — appropriate for an explicit retry after a failure, wrong
   * for a background refresh, which should keep showing the still-good data
   * already on screen until (and unless) the new fetch actually succeeds.
   */
  const load = useCallback((clear: boolean) => {
    const cancelled = { current: false }
    if (clear) {
      setError(undefined)
      setData(undefined)
    }
    const base = assetUrl(`data/${DATA_YEAR}`)
    // Populated by `optional()` below as each safety/schedule-relevant fetch
    // settles; read once every promise in the Promise.all has resolved.
    const partialDataWarnings: PartialDataWarning[] = []
    const optional = <T,>(warning: PartialDataWarning, promise: Promise<T>, fallback: T): Promise<T> =>
      promise.catch((cause) => {
        console.error(`${warning} data failed to load; continuing without it.`, cause)
        partialDataWarnings.push(warning)
        return fallback
      })

    Promise.all([
      loadJson<CityLayout>(`${base}/layout.json`),
      loadJson<ArtItem[]>(`${base}/art.json`),
      loadJson<CampItem[]>(`${base}/camp.json`),
      loadJson<EventItem[]>(`${base}/event.json`),
      optional('services', loadJson<GeoJSON.FeatureCollection>(`${base}/cpns.geojson`), empty()),
      optional('toilets', loadJson<GeoJSON.FeatureCollection>(`${base}/toilets.geojson`), empty()),
      optional(
        'dates',
        loadJson<{ rangeInfo?: EventRange }>(`${base}/dates_info.json`),
        {} as { rangeInfo?: EventRange },
      ),
      // Cosmetic geometry only — no warning tracked for this one.
      loadJson<GeoJSON.FeatureCollection>(`${base}/city_blocks.geojson`).catch(() => empty()),
    ])
      .then(([layout, rawArt, rawCamps, events, serviceSpecs, rawToilets, dates, outlines]) => {
        if (cancelled.current) return
        const embargo = embargoState(embargoWindowForYear(DATA_YEAR))
        const art = applyEmbargo(rawArt, embargo.artReleased)
        const camps = applyEmbargo(rawCamps, embargo.campsReleased)
        const city = buildCity(layout)
        const listed = toPois(layout, art, camps, embargo)
        const services = buildServices(serviceSpecs)
        const toilets = toiletPoints(rawToilets)
        setData({
          layout,
          city,
          art,
          camps,
          events,
          // The survey's places share the index with the listings so that a tap
          // on a ranger station resolves the same way a tap on a camp does.
          // They are not embargoed: the city's own infrastructure is published
          // with the survey, and only participants' locations are held back.
          pois: [...listed.pois, ...civicPois(layout, services, toilets, city.landmarks)],
          unplaced: listed.unplaced,
          range: dates.rangeInfo,
          services,
          toilets,
          campOutlines: outlines,
          embargo,
          partialDataWarnings,
        })
        setError(undefined)
      })
      .catch((cause) => !cancelled.current && setError(cause as Error))

    return () => {
      cancelled.current = true
    }
  }, [])

  useEffect(() => load(true), [attempt, load])

  // The service worker refreshes camp/event/listing data in the background
  // and, once a complete revision has fetched cleanly, tells every open tab
  // about it — otherwise a scheduled data update stayed invisible for the
  // rest of whatever session was already open, even though the cache behind
  // it had already moved on. Re-running the fetch now picks it up, since it
  // is served from the (now-updated) cache rather than the network — without
  // blanking the screen back to the loading state in the meantime.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const onMessage = (event: MessageEvent) => {
      if ((event.data as { type?: string } | null)?.type === 'DATA_REFRESHED') load(false)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [load])

  return { data, error, retry }
}

/**
 * Resolve every camp and art piece to a position. Published GPS wins; anything
 * without it falls back to geocoding its address string, which is how records
 * behave before the survey team publishes coordinates.
 */
/** Exported for the tests: this is where the embargo decides what is reachable. */
export function toPois(
  layout: CityLayout,
  art: ArtItem[],
  camps: CampItem[],
  embargo: EmbargoState,
): { pois: Poi[]; unplaced: UnplacedListing[] } {
  const pois: Poi[] = []
  const unplaced: UnplacedListing[] = []

  const sort = (
    item: ArtItem | CampItem,
    kind: 'art' | 'camp',
    subtitle: string | undefined,
    released: boolean,
  ) => {
    const position = resolve(layout, item.location, item.location_string)
    if (position) {
      pois.push({
        uid: item.uid,
        kind,
        name: item.name,
        subtitle,
        description: item.description,
        address: item.location_string,
        position,
        positionSource: hasGps(item.location) ? 'gps' : 'address',
        thumbnail: item.images?.[0]?.thumbnail_url,
      })
      return
    }
    // Everything that cannot be placed used to be dropped here, silently, and
    // with it went every art piece in the catalogue for the week before Gates.
    // The listing is not the embargoed part; the location is, and there is
    // none of it on this record to leak.
    unplaced.push({
      uid: item.uid,
      kind,
      name: item.name,
      subtitle,
      description: item.description,
      thumbnail: item.images?.[0]?.thumbnail_url,
      reason: released ? 'unpublished' : 'embargoed',
    })
  }

  for (const item of art) sort(item, 'art', item.artist, embargo.artReleased)
  for (const item of camps) sort(item, 'camp', item.hometown, embargo.campsReleased)

  return { pois, unplaced }
}

function hasGps(location: { gps_latitude?: number; gps_longitude?: number } | undefined) {
  return location?.gps_latitude != null && location.gps_longitude != null
}

function resolve(
  layout: CityLayout,
  location: { gps_latitude?: number; gps_longitude?: number; exact_location?: string } | undefined,
  address: string | undefined,
): [number, number] | undefined {
  const exactLocation = location?.exact_location
  if (location?.gps_latitude != null && location.gps_longitude != null) {
    return [location.gps_longitude, location.gps_latitude]
  }
  if (address) return frontagePosition(layout, address, exactLocation)
  return undefined
}

/** Events joined to the camp or art piece that hosts them. */
export function useEventsByHost(data: PlayaData | undefined) {
  return useMemo(() => {
    const byHost = new Map<string, EventItem[]>()
    if (!data) return byHost
    for (const event of data.events) {
      const host = event.hosted_by_camp ?? event.located_at_art
      if (!host) continue
      const list = byHost.get(host)
      if (list) list.push(event)
      else byHost.set(host, [event])
    }
    return byHost
  }, [data])
}
