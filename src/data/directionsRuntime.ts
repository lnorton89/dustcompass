import type { CityLayout } from '../brc/layout'
import { isNearCity, type Position } from '../brc/geo'
import type { Poi } from './types'
import type { DirectionsEndpoint } from './directions'
import { trustedAddressPosition } from './locationTrust'

export type DirectionsAccuracy = 'exact' | 'published' | 'approximate'

export interface ResolvedDirectionsEndpoint {
  endpoint: DirectionsEndpoint
  label: string
  detail?: string
  position: Position
  dynamic: boolean
  accuracy: DirectionsAccuracy
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
    case 'live': return 'Your location'
    case 'man': return 'The Man'
    case 'poi': return pois.find((poi) => poi.uid === endpoint.uid)?.name ?? 'Unknown listing'
    case 'address': return endpoint.address
    case 'fixed': return endpoint.label
  }
}

function poiAccuracy(poi: Poi): DirectionsAccuracy {
  if (poi.accuracyClass === 'derived') return 'approximate'
  if (poi.accuracyClass === 'published') return 'published'
  return 'exact'
}

export function resolveDirectionsEndpoint(
  endpoint: DirectionsEndpoint,
  context: DirectionsResolutionContext,
): ResolvedDirectionsEndpoint | undefined {
  switch (endpoint.kind) {
    case 'live':
      if (!context.livePosition) return undefined
      return {
        endpoint,
        label: 'Your location',
        position: context.livePosition,
        dynamic: true,
        accuracy: 'exact',
      }
    case 'man':
      return {
        endpoint,
        label: 'The Man',
        position: manPosition(context.layout),
        dynamic: false,
        accuracy: 'exact',
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
        accuracy: poiAccuracy(poi),
      }
    }
    case 'address': {
      const position = trustedAddressPosition(endpoint.address, endpoint.position, context.layout)
      if (!position) return undefined
      return {
        endpoint,
        label: endpoint.address,
        position,
        dynamic: false,
        // A typed survey address and an exact dropped pin are not the same
        // provenance as a listing derived from frontage/address data (#137).
        accuracy: 'exact',
      }
    }
    case 'fixed':
      // Directions are deliberately BRC-local. A globally valid coordinate is
      // not enough to make an arbitrary serialized point a safe route endpoint.
      if (!isNearCity(context.layout, endpoint.position)) return undefined
      return {
        endpoint,
        label: endpoint.label,
        position: endpoint.position,
        dynamic: false,
        accuracy: 'exact',
      }
  }
}

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
