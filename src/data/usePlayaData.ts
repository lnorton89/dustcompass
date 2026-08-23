import { useEffect, useMemo, useState } from 'react'
import type { CityLayout } from '../brc/layout'
import { buildCity, type CityGeometry } from '../brc/city'
import { buildServices, toiletPoints, type ServiceSpec } from '../brc/services'
import { geocode } from '../brc/geocode'
import type { ArtItem, CampItem, EventItem, Poi } from './types'
import { applyEmbargo, BRC_2026, embargoState, type EmbargoState } from './embargo'
import type { EventRange } from './events'

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

const DATA_YEAR = import.meta.env.VITE_DATA_YEAR ?? '2025'

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

  useEffect(() => {
    let cancelled = false
    const base = `${import.meta.env.BASE_URL}data/${DATA_YEAR}`

    Promise.all([
      loadJson<CityLayout>(`${base}/layout.json`),
      loadJson<ArtItem[]>(`${base}/art.json`),
      loadJson<CampItem[]>(`${base}/camp.json`),
      loadJson<EventItem[]>(`${base}/event.json`),
      loadJson<ServiceSpec[]>(`${base}/services.json`).catch<ServiceSpec[]>(() => []),
      loadJson<GeoJSON.FeatureCollection>(`${base}/toilets.geojson`).catch(() => empty()),
      loadJson<{ rangeInfo?: EventRange }>(`${base}/dates_info.json`).catch<{
        rangeInfo?: EventRange
      }>(() => ({})),
      loadJson<GeoJSON.FeatureCollection>(`${base}/camp_outlines.geojson`).catch(() => empty()),
    ])
      .then(([layout, rawArt, rawCamps, events, serviceSpecs, rawToilets, dates, outlines]) => {
        if (cancelled) return
        const embargo = embargoState(BRC_2026)
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
          services: buildServices(layout, serviceSpecs),
          toilets: toiletPoints(rawToilets),
          campOutlines: outlines,
          embargo,
        })
      })
      .catch((cause) => !cancelled && setError(cause as Error))

    return () => {
      cancelled = true
    }
  }, [])

  return { data, error }
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
        thumbnail: item.images?.[0]?.thumbnail_url,
      })
    }
  }

  return out
}

function resolve(
  layout: CityLayout,
  location: { gps_latitude?: number; gps_longitude?: number } | undefined,
  address: string | undefined,
): [number, number] | undefined {
  if (location?.gps_latitude != null && location.gps_longitude != null) {
    return [location.gps_longitude, location.gps_latitude]
  }
  if (address) return geocode(address, layout)?.position
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
