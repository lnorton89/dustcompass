import { distanceBetween, metersToFeet, type Position } from './geo'

/**
 * Playa travel speeds. These are deliberately slower than road equivalents:
 * you are riding a cruiser bike over dust in the dark, dodging art cars and
 * stopping for things. iBurn uses comparable figures.
 */
const WALK_METERS_PER_SECOND = 1.15 // ~2.6 mph
const BIKE_METERS_PER_SECOND = 3.1 // ~7 mph

export interface Travel {
  meters: number
  feet: number
  miles: number
  walkMinutes: number
  bikeMinutes: number
}

export function travelBetween(from: Position, to: Position): Travel {
  const meters = distanceBetween(from, to)
  return {
    meters,
    feet: metersToFeet(meters),
    miles: meters / 1609.344,
    walkMinutes: meters / WALK_METERS_PER_SECOND / 60,
    bikeMinutes: meters / BIKE_METERS_PER_SECOND / 60,
  }
}

export function formatMinutes(minutes: number): string {
  if (minutes < 1) return '<1 min'
  if (minutes < 60) return `${Math.round(minutes)} min`
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes % 60)
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

export function formatDistance(travel: Travel): string {
  return travel.miles < 0.25
    ? `${Math.round(travel.feet / 10) * 10} ft`
    : `${travel.miles.toFixed(1)} mi`
}
