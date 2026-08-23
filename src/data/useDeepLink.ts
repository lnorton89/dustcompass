import { useCallback, useEffect, useRef, useState } from 'react'
import type { CityLayout } from '../brc/layout'
import { geocode, reverseGeocode } from '../brc/geocode'
import type { Position } from '../brc/geo'

export interface DeepLink {
  /** A selected listing, by its Burning Man uid. */
  poi?: string
  /** A dropped pin, carried as a playa address rather than raw coordinates. */
  at?: string
}

/**
 * Locations travel between people as addresses, not coordinates — "meet us at
 * 7:30 & Esplanade" is what gets said out loud. Keeping the URL in that form
 * means the link is still useful when it is pasted into a message and read by a
 * human, or typed off someone else's screen.
 */
export function readDeepLink(
  search = typeof window === 'undefined' ? '' : window.location.search,
): DeepLink {
  const params = new URLSearchParams(search)
  const link: DeepLink = {}
  const poi = params.get('poi')
  const at = params.get('at')
  if (poi) link.poi = poi
  if (at) link.at = at
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
  return url.toString()
}

/** Resolve the `at` parameter to a position, if it names a real place. */
export function resolveDeepLink(link: DeepLink, layout: CityLayout): Position | undefined {
  return link.at ? geocode(link.at, layout)?.position : undefined
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
