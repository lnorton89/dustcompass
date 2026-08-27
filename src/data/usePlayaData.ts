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

export type PartialDataWarning = 'toilets' | 'services' | 'dates'

export interface PlayaData {
  layout: CityLayout
  city: CityGeometry
  art: ArtItem[]
  camps: CampItem[]
  events: EventItem[]
  pois: Poi[]
  unplaced: UnplacedListing[]
  range?: EventRange
  services: GeoJSON.FeatureCollection<GeoJSON.Point>
  toilets: GeoJSON.FeatureCollection<GeoJSON.Point>
  campOutlines: GeoJSON.FeatureCollection
  embargo: EmbargoState
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

  const rawRef = useRef<
    { layout: CityLayout; art: ArtItem[]; camps: CampItem[]; civic: Poi[] } | undefined
  >(undefined)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Every load gets a monotonically increasing generation. A later retry or
  // DATA_REFRESHED message immediately makes every earlier completion stale,
  // regardless of network completion order (#167).
  const loadGenerationRef = useRef(0)
  const mountedRef = useRef(true)

  const clearScheduledTransition = useCallback(() => {
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current)
      timerRef.current = undefined
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      loadGenerationRef.current += 1
      clearScheduledTransition()
    }
  }, [clearScheduledTransition])

  const scheduleEmbargoTransition = useCallback(
    (cancelled: { current: boolean }) => {
      const embargoWindow = embargoWindowForYear(DATA_YEAR)

      function armNextBoundary() {
        clearScheduledTransition()
        const raw = rawRef.current
        if (!raw || cancelled.current || !mountedRef.current) return
        const current = embargoState(embargoWindow)
        const nextBoundary = !current.campsReleased
          ? embargoWindow.campRelease
          : !current.artReleased
            ? embargoWindow.gatesOpen
            : undefined
        if (!nextBoundary) return

        timerRef.current = setTimeout(() => {
          if (cancelled.current || !mountedRef.current) return
          if (Date.now() < nextBoundary.getTime()) {
            armNextBoundary()
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
          armNextBoundary()
        }, Math.max(0, nextBoundary.getTime() - Date.now()))
      }

      armNextBoundary()
    },
    [clearScheduledTransition],
  )

  const load = useCallback(() => {
    const generation = ++loadGenerationRef.current
    const cancelled = { current: false }
    const isCurrent = () =>
      mountedRef.current && !cancelled.current && generation === loadGenerationRef.current

    clearScheduledTransition()
    const base = assetUrl(`data/${DATA_YEAR}`)
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
        {},
      ),
      loadJson<GeoJSON.FeatureCollection>(`${base}/city_blocks.geojson`).catch(() => empty()),
    ])
      .then(([layout, rawArt, rawCamps, events, serviceSpecs, rawToilets, dates, outlines]) => {
        if (!isCurrent()) return
        const embargo = embargoState(embargoWindowForYear(DATA_YEAR))
        const art = applyEmbargo(rawArt, embargo.artReleased)
        const camps = applyEmbargo(rawCamps, embargo.campsReleased)
        const city = buildCity(layout)
        const listed = toPois(layout, art, camps, embargo)
        const services = buildServices(serviceSpecs)
        const toilets = toiletPoints(rawToilets)
        const civic = civicPois(layout, services, toilets, city.landmarks)
        // Commit raw and visible state under the same generation check. An old
        // response can no longer overwrite either after a newer load wins.
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
      .catch((cause: unknown) => {
        if (isCurrent()) {
          setError(cause instanceof Error ? cause : new Error(String(cause)))
        }
      })

    return () => {
      cancelled.current = true
      // A stale load's cleanup must not clear the timer armed by a newer one.
      if (generation === loadGenerationRef.current) clearScheduledTransition()
    }
  }, [clearScheduledTransition, scheduleEmbargoTransition])

  useEffect(() => load(), [attempt, load])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const onMessage = (event: MessageEvent) => {
      if ((event.data as { type?: string } | null)?.type === 'DATA_REFRESHED') load()
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [load])

  return { data, error, retry }
}

const STALE_THRESHOLD = 20

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
        accuracyClass: hasGps(item.location) ? 'published' : 'derived',
        thumbnail: item.images?.[0]?.thumbnail_url,
      })
      return
    }
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
