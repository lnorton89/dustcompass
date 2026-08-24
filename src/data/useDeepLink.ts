import { useCallback, useEffect, useRef, useState } from 'react'
import type { CityLayout } from '../brc/layout'
import { geocode, reverseGeocode } from '../brc/geocode'
import { distanceBetween, isNearCity, type Position } from '../brc/geo'
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
  // `ll` only ever means anything as a refinement of `at` — a bare `?ll=`
  // with no address to refine is not a real link this app ever generates,
  // and trusting it as an independent coordinate let it fly the opening
  // camera anywhere on Earth (#74). The rest of the consistency check (is it
  // even near the city, does it roughly agree with what `at` geocodes to)
  // needs the layout and happens in `resolveDeepLink` below.
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

/**
 * The URL to hand to someone else.
 *
 * A listing gets its own page rather than a query parameter, because that page
 * carries the listing's name, address and photo in its metadata — so the link
 * unfurls as that camp instead of as the app's front door. It sends the reader
 * straight on to the same map view a `?poi=` link would have opened.
 */
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

/**
 * Result of resolving a deep link's location. A bare `Position | undefined`
 * cannot tell a caller "there was nothing to resolve" from "resolution was
 * attempted and the address didn't parse" — and a caller that gates one-time
 * restoration on that distinction (only advancing past a cold deep link once
 * it has been resolved, successfully or not) would otherwise stay stuck
 * waiting forever on an `at` that will never resolve.
 */
export type DeepLinkResolution =
  | { status: 'resolved'; position: Position }
  | { status: 'unresolvable' }
  | { status: 'none' }

// How far `ll` may legitimately drift from what `at` itself geocodes to and
// still be trusted as the same tapped point. `at` only ever carries what
// `reverseGeocode` rounded it to — the nearest 15 minutes of clock, nearest
// 50 ft of open-playa radius, or a snap onto a nearby street — so a genuine
// exact pin can land a couple hundred metres from its own rounded address
// without the two actually disagreeing about where the pin is (#74). This is
// generous enough to survive that rounding but far short of the distance
// between two different named intersections, which is what a contradictory
// or hand-edited link produces.
const LL_CONSISTENCY_TOLERANCE_METERS = 250

/**
 * Resolve a deep link to a position. `ll`, when present, is meant to be the
 * exact tapped coordinate behind `at`'s rounded address — but it arrives as
 * an untrusted URL parameter, so it only wins outright once it has actually
 * earned that trust: `at` must be present, `ll` must be somewhere near the
 * city at all, and `at`'s own geocoded position must land within a rounding
 * error of it. A bare `?ll=` (no `at`) never reaches here at all — dropped
 * already by `readDeepLink`. Anything else — `ll` on the other side of the
 * planet, or naming a different intersection than `at` does — falls back to
 * resolving `at` on its own, exactly as an old link (from before `ll`
 * existed) would (#74).
 */
export function resolveDeepLink(link: DeepLink, layout: CityLayout): DeepLinkResolution {
  if (link.ll && link.at && isNearCity(layout, link.ll)) {
    const geocoded = geocode(link.at, layout)
    if (geocoded && distanceBetween(geocoded.position, link.ll) <= LL_CONSISTENCY_TOLERANCE_METERS) {
      return { status: 'resolved', position: link.ll }
    }
  }
  if (!link.at) return { status: 'none' }
  const result = geocode(link.at, layout)
  return result ? { status: 'resolved', position: result.position } : { status: 'unresolvable' }
}

export function addressFor(position: Position, layout: CityLayout): string {
  return reverseGeocode(position, layout).label
}

/**
 * Mirrors the current selection into the address bar without adding history
 * entries — the back button should leave the map, not step through every camp
 * that was tapped along the way.
 */
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
