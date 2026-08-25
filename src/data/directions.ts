import { DATA_YEAR } from '../config'
import type { Position } from '../brc/geo'

export type DirectionsMode = 'walk' | 'bike'

export type DirectionsEndpoint =
  | { kind: 'live' }
  | { kind: 'man' }
  | { kind: 'poi'; uid: string }
  | { kind: 'address'; address: string; position?: Position }
  | { kind: 'fixed'; label: string; position: Position }

export interface DirectionsIntent {
  version: 1
  from: DirectionsEndpoint
  to: DirectionsEndpoint
  mode: DirectionsMode
}

const VERSION = '1'
const roundCoord = (n: number) => Math.round(n * 1e6) / 1e6

function encodePosition([lng, lat]: Position): string {
  return `${roundCoord(lng)},${roundCoord(lat)}`
}

function parsePosition(raw: string): Position | undefined {
  const parts = raw.split(',')
  if (parts.length !== 2) return undefined
  const lng = Number(parts[0])
  const lat = Number(parts[1])
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return undefined
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return undefined
  return [lng, lat]
}

function encodeEndpoint(endpoint: DirectionsEndpoint): string {
  switch (endpoint.kind) {
    case 'live':
      // Deliberately carries no coordinate. A shared "Your location" route
      // resolves against the recipient's own fresh fix instead of leaking the
      // sender's precise position into a URL (#132).
      return 'live'
    case 'man':
      return 'man'
    case 'poi':
      return `poi:${endpoint.uid}`
    case 'address':
      return endpoint.position
        ? `at:${endpoint.address}|${encodePosition(endpoint.position)}`
        : `at:${endpoint.address}`
    case 'fixed':
      return `fixed:${endpoint.label}|${encodePosition(endpoint.position)}`
  }
}

function decodeEndpoint(raw: string | null): DirectionsEndpoint | undefined {
  if (!raw) return undefined
  if (raw === 'live') return { kind: 'live' }
  if (raw === 'man') return { kind: 'man' }

  if (raw.startsWith('poi:')) {
    const uid = raw.slice(4).trim()
    return uid ? { kind: 'poi', uid } : undefined
  }

  if (raw.startsWith('at:')) {
    const payload = raw.slice(3)
    const separator = payload.lastIndexOf('|')
    if (separator < 0) {
      const address = payload.trim()
      return address ? { kind: 'address', address } : undefined
    }
    const address = payload.slice(0, separator).trim()
    const position = parsePosition(payload.slice(separator + 1))
    return address && position ? { kind: 'address', address, position } : undefined
  }

  if (raw.startsWith('fixed:')) {
    const payload = raw.slice(6)
    const separator = payload.lastIndexOf('|')
    if (separator < 0) return undefined
    const label = payload.slice(0, separator).trim()
    const position = parsePosition(payload.slice(separator + 1))
    return label && position ? { kind: 'fixed', label, position } : undefined
  }

  return undefined
}

export function directionsUrl(
  intent: DirectionsIntent,
  base = typeof window === 'undefined'
    ? 'https://lnorton89.github.io/dustcompass/'
    : window.location.href,
): string {
  const url = new URL(base)
  url.search = ''
  url.hash = ''
  url.searchParams.set('dir', VERSION)
  url.searchParams.set('year', String(DATA_YEAR))
  url.searchParams.set('from', encodeEndpoint(intent.from))
  url.searchParams.set('to', encodeEndpoint(intent.to))
  url.searchParams.set('mode', intent.mode)
  return url.toString()
}

export function readDirectionsIntent(
  search = typeof window === 'undefined' ? '' : window.location.search,
): DirectionsIntent | undefined {
  const params = new URLSearchParams(search)
  if (params.get('dir') !== VERSION) return undefined
  // Annual POI identities and street geometry are not portable between BRC
  // surveys. Refuse a route for another data year instead of silently opening
  // its names/coordinates against the wrong city plan.
  if (params.get('year') !== String(DATA_YEAR)) return undefined

  const from = decodeEndpoint(params.get('from'))
  const to = decodeEndpoint(params.get('to'))
  const mode = params.get('mode')
  if (!from || !to || (mode !== 'walk' && mode !== 'bike')) return undefined

  return { version: 1, from, to, mode }
}

/**
 * Automatic navigation origin for the directions UI. A usable live fix is
 * represented symbolically rather than copied into route state, so it can keep
 * following GPS updates. Every failure/stale/out-of-city path visibly falls
 * back to the Man and remains editable by the caller (#132).
 */
export function defaultDirectionsOrigin(hasUsableLiveFix: boolean): DirectionsEndpoint {
  return hasUsableLiveFix ? { kind: 'live' } : { kind: 'man' }
}
