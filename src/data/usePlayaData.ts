import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

  // The pre-embargo dataset from the most recent successful fetch, kept
  // around so a release-boundary transition can be recomputed locally —
  // `art`/`camps`/`pois`/`unplaced` all derive from this plus the current
  // time — without going back to the network. `civic` (services/toilets/
  // landmarks) isn't embargoed and doesn't change across a transition, so
  // it's cached alongside rather than recomputed.
  const rawRef = useRef<
    { layout: CityLayout; art: ArtItem[]; camps: CampItem[]; civic: Poi[] } | undefined
  >(undefined)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const clearScheduledTransition = useCallback(() => {
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current)
      timerRef.current = undefined
    }
  }, [])

  /**
   * Recompute embargo/art/camps/pois/unplaced from the cached pre-embargo
   * dataset and arm a timer for whichever configured release boundary (camp
   * release, then gates-open) hasn't happened yet — nothing is scheduled once
   * both are released. Called once after a successful fetch and again,
   * recursively, from the fired timer itself, so a session left open across
   * both boundaries picks each one up without a reload. `cancelled` is the
   * same guard `load()` uses for its own fetch, so a superseding load or an
   * unmount stops this chain too.
   */
  const scheduleEmbargoTransition = useCallback(
    (cancelled: { current: boolean }) => {
      clearScheduledTransition()
      const raw = rawRef.current
      if (!raw) return
      const embargoWindow = embargoWindowForYear(DATA_YEAR)
      const current = embargoState(embargoWindow)
      const nextBoundary = !current.campsReleased
        ? embargoWindow.campRelease
        : !current.artReleased
          ? embargoWindow.gatesOpen
          : undefined
      if (!nextBoundary) return

      const fire = () => {
        if (cancelled.current) return
        // A fake/host-clamped timer can fire a tick early; recheck the wall
        // clock rather than trust the callback, and reschedule the remainder
        // instead of ever revealing data ahead of the configured instant.
        if (Date.now() < nextBoundary.getTime()) {
          scheduleEmbargoTransition(cancelled)
          return
        }
        const embargo = embargoState(embargoWindow)
        const art = applyEmbargo(raw.art, embargo.artReleased)
        const camps = applyEmbargo(raw.camps, embargo.campsReleased)
        const listed = toPois(raw.layout, art, camps, embargo)
        setData((prev) =>
          prev && {
            ...prev,
            art,
            camps,
            pois: [...listed.pois, ...raw.civic],
            unplaced: listed.unplaced,
            embargo,
          },
        )
        scheduleEmbargoTransition(cancelled)
      }
      timerRef.current = setTimeout(fire, Math.max(0, nextBoundary.getTime() - Date.now()))
    },
    [clearScheduledTransition],
  )

  /**
   * Shared by the initial/retry load and the silent background refresh
   * below. `clear` decides whether to blank the screen back to the loading
   * spinner first — appropriate for an explicit retry after a failure, wrong
   * for a background refresh, which should keep showing the still-good data
   * already on screen until (and unless) the new fetch actually succeeds.
   */
  const load = useCallback((clear: boolean) => {
    const cancelled = { current: false }
    // A new load — retry or background refresh — makes whatever boundary
    // was pending from the previous load's dataset moot; it'll be re-armed
    // below once this load's fetch succeeds.
    clearScheduledTransition()
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
        // The survey's places share the index with the listings so that a tap
        // on a ranger station resolves the same way a tap on a camp does.
        // They are not embargoed: the city's own infrastructure is published
        // with the survey, and only participants' locations are held back.
        const civic = civicPois(layout, services, toilets, city.landmarks)
        rawRef.current = { layout, art: rawArt, camps: rawCamps, civic }
        setData({
          layout,
          city,
          art,
          camps,
          events,
          pois: [...listed.pois, ...civic],
          unplaced: listed.unplaced,
          range: dates.rangeInfo,
          services,
          toilets,
          campOutlines: outlines,
          embargo,
          partialDataWarnings,
        })
        setError(undefined)
        scheduleEmbargoTransition(cancelled)
      })
      .catch((cause) => !cancelled.current && setError(cause as Error))

    return () => {
      cancelled.current = true
      clearScheduledTransition()
    }
  }, [clearScheduledTransition, scheduleEmbargoTransition])

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
/**
 * How many art records it takes before "none of them has a location" means the
 * data is old rather than empty. Burning Man publishes hundreds; a handful
 * would not tell us anything either way.
 */
const STALE_THRESHOLD = 20

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
        // Published API GPS is best-effort, not surveyed — Burning Man's own
        // documentation says a camp/art piece can still move after
        // Placement finishes publishing coordinates (#61). Only the GIS
        // survey's own civic points (see civic.ts) earn 'surveyed'.
        accuracyClass: hasGps(item.location) ? 'published' : 'derived',
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

  /*
   * Gates open on the clock, but the locations arrive over the network — and
   * the people this app is for are the ones with no network. A phone that
   * cached the city before Gates holds art records with every location stripped
   * out, and the moment the embargo lifts it would have called all 329 of them
   * "no location published", which is the opposite of what happened: they were
   * published, and this copy is older than they are.
   *
   * Not one of hundreds having a location is not a catalogue with nothing in
   * it, it is a snapshot from before. Said plainly, it also tells the reader
   * the one thing that would fix it — a minute of signal.
   */
  markStaleSnapshot('camp', camps, embargo.campsReleased, pois, unplaced)
  markStaleSnapshot('art', art, embargo.artReleased, pois, unplaced)

  return { pois, unplaced }
}

function markStaleSnapshot(
  kind: 'camp' | 'art',
  source: unknown[],
  released: boolean,
  pois: Poi[],
  unplaced: UnplacedListing[],
) {
  if (!released || source.length < STALE_THRESHOLD || pois.some((poi) => poi.kind === kind)) return
  for (const listing of unplaced) {
    if (listing.kind === kind) listing.reason = 'stale'
  }
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
