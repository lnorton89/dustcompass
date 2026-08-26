import { geocode, reverseGeocode } from '../brc/geocode'
import { isNearCity, type Position } from '../brc/geo'
import type { CityLayout } from '../brc/layout'

export function normalizedPlayaAddress(address: string): string {
  return address.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * An exact coordinate attached to a playa address is only a refinement of that
 * address when the app's own reverse geocoder gives the same normalized label.
 * Metric proximity alone can span neighbouring 15-minute intersections (#105,
 * #134), so the human-readable address is the trust boundary.
 */
export function trustedAddressPosition(
  address: string,
  position: Position | undefined,
  layout: CityLayout,
): Position | undefined {
  const geocoded = geocode(address, layout)
  if (!geocoded) return undefined
  if (!position || !isNearCity(layout, position)) return geocoded.position
  const roundTripped = reverseGeocode(position, layout)
  return normalizedPlayaAddress(roundTripped.label) === normalizedPlayaAddress(address)
    ? position
    : geocoded.position
}
