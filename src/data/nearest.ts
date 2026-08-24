import { distanceBetween, type Position } from '../brc/geo'
import type { ServiceCategory } from '../brc/services'
import type { Poi } from './types'

/**
 * The closest POI of a given surveyed service category to `origin`, or
 * undefined if the current dataset has none (#66). Toilets are deliberately
 * excluded from ordinary search results — forty banks all answering to
 * "Toilets" are forty ways of saying nothing as a list — but "nearest" is
 * exactly the question that answers, so this exists to complete that: the
 * app already has precise survey coordinates, the shared GPS position, and
 * a distance calculation; nothing here needs a network or a routing
 * backend.
 */
export function nearestOfCategory(
  pois: Poi[],
  category: ServiceCategory,
  origin: Position,
): Poi | undefined {
  let best: Poi | undefined
  let bestDistance = Infinity
  for (const poi of pois) {
    if (poi.category !== category) continue
    const distance = distanceBetween(origin, poi.position)
    if (distance < bestDistance) {
      best = poi
      bestDistance = distance
    }
  }
  return best
}
