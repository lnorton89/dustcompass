import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CityLayout } from '../brc/layout'
import { buildCity, type CityGeometry } from '../brc/city'
import { buildServices, toiletPoints } from '../brc/services'
import { frontagePosition } from '../brc/frontage'
import type { ArtItem, CampItem, EventItem, Poi } from './types'
import { applyEmbargo, embargoState, embargoWindowForYear, type EmbargoState } from './embargo'
import type { EventRange } from './events'
import { DATA_YEAR, assetUrl } from '../config'

export interface PlayaData {
  layout: CityLayout
  city: CityGeometry
  art: ArtItem[]
  camps: CampItem[]
  events: EventItem[]
  pois: Poi[]
  /** The event week these listings describe, used to anchor "what's on now". */
  range?: EventRange
  services: GeoJSON.FeatureCollection<GeoJSON.Point>
  toilets: GeoJSON.FeatureCollection<GeoJSON.Point>
  /** Surveyed camp block footprints, drawn at high zoom. */
  campOutlines: GeoJSON.FeatureCollection
  embargo: EmbargoState
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

  useEffect(() => {
    let cancelled = false
    const base = assetUrl(`data/${DATA_YEAR}`)

    Promise.all([
      loadJson<CityLayout>(`${base}/layout.json`),
      loadJson<ArtItem[]>(`${base}/art.json`),
      loadJson<CampItem[]>(`${base}/camp.json`),
      loadJson<EventItem[]>(`${base}/event.json`),
      loadJson<GeoJSON.FeatureCollection>(`${base}/cpns.geojson`).catch(() => empty()),
      loadJson<GeoJSON.FeatureCollection>(`${base}/toilets.geojson`).catch(() => empty()),
      loadJson<{ rangeInfo?: EventRange }>(`${base}/dates_info.json`).catch<{
        rangeInfo?: EventRange
      }>(() => ({})),
      loadJson<GeoJSON.FeatureCollection>(`${base}/city_blocks.geojson`).catch(() => empty()),
    ])
      .then(([layout, rawArt, rawCamps, events, serviceSpecs, rawToilets, dates, outlines]) => {
        if (cancelled) return
        const embargo = embargoState(embargoWindowForYear(DATA_YEAR))
        const art = applyEmbargo(rawArt, embargo.artReleased)
        const camps = applyEmbargo(rawCamps, embargo.campsReleased)
        setData({
          layout,
          city: buildCity(layout),
          art,
          camps,
          events,
          pois: toPois(layout, art, camps),
          range: dates.rangeInfo,
          services: buildServices(serviceSpecs),
          toilets: toiletPoints(rawToilets),
          campOutlines: outlines,
          embargo,
        })
      })
      .catch((cause) => !cancelled && setError(cause as Error))

    return () => {
      cancelled = true
    }
  }, [attempt])

  return { data, error, retry }
}

/**
 * Resolve every camp and art piece to a position. Published GPS wins; anything
 * without it falls back to geocoding its address string, which is how records
 * behave before the survey team publishes coordinates.
 */
function toPois(layout: CityLayout, art: ArtItem[], camps: CampItem[]): Poi[] {
  const out: Poi[] = []

  for (const item of art) {
    const position = resolve(layout, item.location, item.location_string)
    if (position) {
      out.push({
        uid: item.uid,
        kind: 'art',
        name: item.name,
        subtitle: item.artist,
        description: item.description,
        address: item.location_string,
        position,
        positionSource: hasGps(item.location) ? 'gps' : 'address',
        thumbnail: item.images?.[0]?.thumbnail_url,
      })
    }
  }

  for (const item of camps) {
    const position = resolve(layout, item.location, item.location_string)
    if (position) {
      out.push({
        uid: item.uid,
        kind: 'camp',
        name: item.name,
        subtitle: item.hometown,
        description: item.description,
        address: item.location_string,
        position,
        positionSource: hasGps(item.location) ? 'gps' : 'address',
        thumbnail: item.images?.[0]?.thumbnail_url,
      })
    }
  }

  return out
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
