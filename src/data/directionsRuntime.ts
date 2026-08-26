import type { CityLayout } from '../brc/layout'
import { geocode } from '../brc/geocode'
import { distanceBetween, isNearCity, type Position } from '../brc/geo'
import type { Poi } from './types'
import type { DirectionsEndpoint } from './directions'

export type DirectionsAccuracy = 'exact' | 'published' | 'approximate'
export interface ResolvedDirectionsEndpoint { endpoint: DirectionsEndpoint; label: string; detail?: string; position: Position; dynamic: boolean; accuracy: DirectionsAccuracy }
export interface DirectionsResolutionContext { layout: CityLayout; pois: readonly Poi[]; livePosition?: Position }
function manPosition(layout: CityLayout): Position { const coordinates = layout.center.geometry.coordinates; return [coordinates[0], coordinates[1]] }
export function directionsEndpointLabel(endpoint: DirectionsEndpoint, pois: readonly Poi[]): string { switch (endpoint.kind) { case 'live': return 'Your location'; case 'man': return 'The Man'; case 'poi': return pois.find((poi) => poi.uid === endpoint.uid)?.name ?? 'Unknown listing'; case 'address': return endpoint.address; case 'fixed': return endpoint.label } }
function poiAccuracy(poi: Poi): DirectionsAccuracy { if (poi.accuracyClass === 'derived') return 'approximate'; if (poi.accuracyClass === 'published') return 'published'; return 'exact' }
function trustedAddressPosition(endpoint: Extract<DirectionsEndpoint, { kind: 'address' }>, layout: CityLayout): Position | undefined {
  const canonical = geocode(endpoint.address, layout); if (!canonical) return undefined
  if (!endpoint.position) return canonical.position
  if (!isNearCity(layout, endpoint.position)) return canonical.position
  return distanceBetween(endpoint.position, canonical.position) <= 45 ? endpoint.position : canonical.position
}
export function resolveDirectionsEndpoint(endpoint: DirectionsEndpoint, context: DirectionsResolutionContext): ResolvedDirectionsEndpoint | undefined {
  switch (endpoint.kind) {
    case 'live': if (!context.livePosition) return undefined; return { endpoint, label: 'Your location', position: context.livePosition, dynamic: true, accuracy: 'exact' }
    case 'man': return { endpoint, label: 'The Man', position: manPosition(context.layout), dynamic: false, accuracy: 'exact' }
    case 'poi': { const poi = context.pois.find((candidate) => candidate.uid === endpoint.uid); if (!poi) return undefined; return { endpoint, label: poi.name, detail: poi.address, position: poi.position, dynamic: false, accuracy: poiAccuracy(poi) } }
    case 'address': {
      const position = trustedAddressPosition(endpoint, context.layout); if (!position) return undefined
      // App's legacy warning path still keys off endpoint.kind. A resolved user
      // address/drop pin is exact, so expose the resolved endpoint as fixed;
      // the original symbolic address remains in Directions state/URLs.
      return { endpoint: { kind: 'fixed', label: endpoint.address, position }, label: endpoint.address, position, dynamic: false, accuracy: 'exact' }
    }
    case 'fixed': if (!isNearCity(context.layout, endpoint.position)) return undefined; return { endpoint, label: endpoint.label, position: endpoint.position, dynamic: false, accuracy: 'exact' }
  }
}
export function resolveDirectionsRoute(from: DirectionsEndpoint, to: DirectionsEndpoint, context: DirectionsResolutionContext): { from: ResolvedDirectionsEndpoint; to: ResolvedDirectionsEndpoint } | undefined { const resolvedFrom = resolveDirectionsEndpoint(from, context); const resolvedTo = resolveDirectionsEndpoint(to, context); if (!resolvedFrom || !resolvedTo) return undefined; return { from: resolvedFrom, to: resolvedTo } }
