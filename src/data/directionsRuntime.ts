import type { CityLayout } from '../brc/layout'
import { geocode } from '../brc/geocode'
import type { Position } from '../brc/geo'
import type { Poi } from './types'
import type { DirectionsEndpoint } from './directions'

export interface ResolvedDirectionsEndpoint {
  endpoint: DirectionsEndpoint
  label: string
  detail?: string
  position: Position
  dynamic: boolean
}

export interface DirectionsResolutionContext {
  layout: CityLayout
  pois: readonly Poi[]
  livePosition?: Position
}

function manPosition(layout: CityLayout): Position {
  const coordinates = layout.center.geometry.coordinates
  return [coordinates[0], coordinates[1]]
}

export function directionsEndpointLabel(endpoint: DirectionsEndpoint, pois: readonly Poi[]): string {
  switch (endpoint.kind) {
    case 'live':
      return 'Your location'
    case 'man':
      return 'The Man'
    case 'poi':
      return pois.find((poi) => poi.uid === endpoint.uid)?.name ?? 'Unknown listing'
    case 'address':
      return endpoint.address
    case 'fixed':
      return endpoint.label
  }
}

export function resolveDirectionsEndpoint(
  endpoint: DirectionsEndpoint,
  context: DirectionsResolutionContext,
): ResolvedDirectionsEndpoint | undefined {
  switch (endpoint.kind) {
    case 'live': {
      if (!context.livePosition) return undefined
      return {
        endpoint,
        label: 'Your location',
        position: context.livePosition,
        dynamic: true,
      }
    }
    case 'man':
      return {
        endpoint,
        label: 'The Man',
        position: manPosition(context.layout),
        dynamic: false,
      }
    case 'poi': {
      const poi = context.pois.find((candidate) => candidate.uid === endpoint.uid)
      if (!poi) return undefined
      return {
        endpoint,
        label: poi.name,
        detail: poi.address,
        position: poi.position,
        dynamic: false,
      }
    }
    case 'address': {
      const geocoded = endpoint.position
        ? { position: endpoint.position, label: endpoint.address }
        : geocode(endpoint.address, context.layout)
      if (!geocoded) return undefined
      return {
        endpoint,
        label: endpoint.address,
        position: geocoded.position,
        dynamic: false,
      }
    }
    case 'fixed':
      return {
        endpoint,
        label: endpoint.label,
        position: endpoint.position,
        dynamic: false,
      }
  }
}

/**
 * Resolve a route while preserving the explicit `Your location` semantics in
 * the intent. If the caller has no usable live fix yet, only that endpoint is
 * unresolved; fixed/manual routes remain fully usable for planning offline.
 */
export function resolveDirectionsRoute(
  from: DirectionsEndpoint,
  to: DirectionsEndpoint,
  context: DirectionsResolutionContext,
): { from: ResolvedDirectionsEndpoint; to: ResolvedDirectionsEndpoint } | undefined {
  const resolvedFrom = resolveDirectionsEndpoint(from, context)
  const resolvedTo = resolveDirectionsEndpoint(to, context)
  if (!resolvedFrom || !resolvedTo) return undefined
  return { from: resolvedFrom, to: resolvedTo }
}
