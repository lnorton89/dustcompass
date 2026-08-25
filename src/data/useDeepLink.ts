import { useCallback, useEffect, useRef, useState } from 'react'
import type { CityLayout } from '../brc/layout'
import { geocode, reverseGeocode } from '../brc/geocode'
import { isNearCity, type Position } from '../brc/geo'
import { BASE_PATH } from '../config'

export interface DeepLink {
  /** A selected listing, by its Burning Man uid. */
  poi?: string
  /** A dropped pin, carried as a playa address rather than raw coordinates. */
  at?: string
  /**
   * The exact coordinate behind `at`, for the cases an address alone would
   * lose: a dropped pin keeps the tapped spot, but `at` only ever carries what
   * `reverseGeocode` rounds it to (nearest 15 minutes of clock, nearest 50 ft
   * of open-playa radius, or snapped onto a nearby street). Always paired with
   * `at` — there is no separate exact point for an ordinary camp-intersection
   * address, which already names an exact place.
   */
  ll?: Position
}

/** `?ll=<lng>,<lat>`, or undefined if it is missing, malformed, or out of range. */
function parsePosition(raw: string): Position | undefined {
  const [lngRaw, latRaw] = raw.split(',')
  if (lngRaw === undefined || latRaw === undefined) return undefined
  const lng = Number(lngRaw)
  const lat = Number(latRaw)
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return undefined
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return undefined
  return [lng, lat]
}

// 6 decimal places is sub-meter precision — plenty for a tapped point, and far
// short of the coordinate's own float noise, so it doesn't bloat the URL.
const roundCoord = (n: number) => Math.round(n * 1e6) / 1e6
function formatPosition([lng, lat]: Position): string {
  return `${roundCoord(lng)},${roundCoord(lat)}`
}

/**
 * Locations travel between people as addresses, not coordinates — "meet us at
 * 7:30 & Esplanade" is what gets said out loud. Keeping the URL in that form
 * means the link is still useful when it is pasted into a message and read by a
 * human, or typed off someone else's screen. `ll`, when present, rides along
 * silently for the app itself to prefer — it is never the only thing in the
 * link, and a human reading the URL still has the address to go on.
 */
export function readDeepLink(
  search = typeof window === 'undefined' ? '' : window.location.search,
): DeepLink {
  const params = new URLSearchParams(search)
  const link: DeepLink = {}
  const poi = params.get('poi')
  const at = params.get('at')
  const ll = params.get('ll')
  if (poi) link.poi = poi
  if (at) link.at = at
  if (ll && at) {
    const position = parsePosition(ll)
    if (position) link.ll = position
  }
  return link
}

export function deepLinkUrl(
  link: DeepLink,
  base = typeof window === 'undefined' ? 'https://lnorton89.github.io/dustcompass/' : window.location.href,
): string {
  const url = new URL(base)
  url.search = ''
  if (link.poi) url.searchParams.set('poi', link.poi)
  if (link.at) url.searchParams.set('at', link.at)
  if (link.ll) url.searchParams.set('ll', formatPosition(link.ll))
  return url.toString()
}

export function shareUrl(
  link: DeepLink,
  base = typeof window === 'undefined' ? 'https://lnorton89.github.io/dustcompass/' : window.location.href,
): string {
  if (!link.poi) return deepLinkUrl(link, base)
  const url = new URL(base)
  url.search = ''
  url.hash = ''
  url.pathname = `${BASE_PATH}/p/${encodeURIComponent(link.poi)}/`
  return url.toString()
}

export type DeepLinkResolution =
  | { status: 'resolved'; position: Position }
  | { status: 'unresolvable' }
  | { status: 'none' }

/**
 * Resolve a deep link to a position. An exact `ll` is trusted only when the
 * app's own address model says that coordinate means the same normalized
 * address as `at`. This is deliberately stricter than a fixed distance radius:
 * adjacent 15-minute clock intersections can be well inside 250 m, so distance
 * alone can accept a coordinate at one named intersection while displaying the
 * label of another (#105).
 */
export function resolveDeepLink(link: DeepLink, layout: CityLayout): DeepLinkResolution {
  if (link.ll && link.at && isNearCity(layout, link.ll)) {
    const geocoded = geocode(link.at, layout)
    if (geocoded) {
      const expectedAddress = reverseGeocode(geocoded.position, layout).label
      const exactAddress = reverseGeocode(link.ll, layout).label
      if (exactAddress === expectedAddress) {
        return { status: 'resolved', position: link.ll }
      }
    }
  }
  if (!link.at) return { status: 'none' }
  const result = geocode(link.at, layout)
  return result ? { status: 'resolved', position: result.position } : { status: 'unresolvable' }
}

export function addressFor(position: Position, layout: CityLayout): string {
  return reverseGeocode(position, layout).label
}

export function useDeepLink() {
  const [initial] = useState(() => readDeepLink())
  const applied = useRef(false)

  const publish = useCallback((link: DeepLink) => {
    const next = deepLinkUrl(link)
    if (next !== window.location.href) window.history.replaceState(null, '', next)
  }, [])

  useEffect(() => {
    applied.current = true
  }, [])

  return { initial, publish, hasApplied: applied }
}
