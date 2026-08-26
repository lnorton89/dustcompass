import { useCallback, useEffect, useRef, useState } from 'react'
import type { CityLayout } from '../brc/layout'
import { reverseGeocode } from '../brc/geocode'
import type { Position } from '../brc/geo'
import { BASE_PATH } from '../config'
import { trustedAddressPosition } from './locationTrust'

export interface DeepLink {
  poi?: string
  at?: string
  ll?: Position
}

function parsePosition(raw: string): Position | undefined {
  const [lngRaw, latRaw] = raw.split(',')
  if (lngRaw === undefined || latRaw === undefined) return undefined
  const lng = Number(lngRaw)
  const lat = Number(latRaw)
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return undefined
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return undefined
  return [lng, lat]
}

const roundCoord = (n: number) => Math.round(n * 1e6) / 1e6
function formatPosition([lng, lat]: Position): string {
  return `${roundCoord(lng)},${roundCoord(lat)}`
}

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
 * `ll` is only an exact refinement of `at`; it must describe the same address
 * under the app's own reverse-geocoding model. Directions and legacy links now
 * share this exact trust boundary so the two formats cannot drift (#105/#134).
 */
export function resolveDeepLink(link: DeepLink, layout: CityLayout): DeepLinkResolution {
  if (!link.at) return { status: 'none' }
  const position = trustedAddressPosition(link.at, link.ll, layout)
  return position ? { status: 'resolved', position } : { status: 'unresolvable' }
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
