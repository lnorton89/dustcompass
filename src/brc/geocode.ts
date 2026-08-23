import type { CityLayout, Feet } from './layout'
import { findAnnular } from './layout'
import {
  clockToMinutes,
  minutesToClock,
  polarToPosition,
  positionToPolar,
  type Position,
} from './geo'

export interface PlayaAddress {
  /** Clock position, e.g. "7:30". */
  clock: string
  /** Radius from the Man, in feet. */
  distanceFeet: Feet
  /** Annular street ref when the address sits on one, e.g. "esplanade", "d". */
  street?: string
  /** Human-readable form, e.g. "D & 3:15" or "12:00 & 2500'". */
  label: string
}

export interface GeocodeResult extends PlayaAddress {
  position: Position
}

const CLOCK = String.raw`\d{1,2}[:.]\d{2}`

/**
 * Parse the address forms that appear in Burning Man's own data and on street
 * signs. All of these resolve:
 *
 *   "D & 3:15"            "3:15 & D"           "7:30 & Esplanade"
 *   "Esplanade & 7:30"    "12:00 2500'"        "4:30 2000 feet"
 *   "9:00 B Plaza"        "3:00 Portal"        "Center Camp Plaza"
 */
export function parseAddress(input: string, layout: CityLayout): PlayaAddress | undefined {
  const raw = input.trim()
  if (!raw) return undefined

  // Named plazas and portals win outright — they are landmarks, not intersections.
  const named = [...layout.plazas, ...layout.portals].find(
    (p) => p.name.toLowerCase() === raw.toLowerCase(),
  )
  if (named) {
    return {
      clock: named.time,
      distanceFeet: resolve(layout, named.distance),
      street: typeof named.distance === 'string' ? named.distance : undefined,
      label: named.name,
    }
  }

  // "<clock> <feet>" — open playa, the form art listings use.
  const open = new RegExp(String.raw`^(${CLOCK})\s*[,&@]?\s*(\d{2,5})\s*(?:'|ft|feet)?`, 'i').exec(raw)
  if (open) {
    const clock = normaliseClock(open[1])
    return {
      clock,
      distanceFeet: Number(open[2]),
      label: `${clock} & ${open[2]}'`,
    }
  }

  // "<clock> & <street>" or "<street> & <clock>", in either order.
  const parts = raw.split(/\s*(?:&|and|at|\/)\s*/i).filter(Boolean)
  if (parts.length >= 2) {
    const clockPart = parts.find((p) => new RegExp(`^${CLOCK}$`).test(p.trim()))
    const streetPart = parts.find((p) => p !== clockPart)
    if (clockPart && streetPart) {
      const street = findAnnular(layout, streetPart)
      if (street) {
        const clock = normaliseClock(clockPart)
        return {
          clock,
          distanceFeet: street.distance,
          street: street.ref,
          label: `${street.name} & ${clock}`,
        }
      }
    }
  }

  return undefined
}

/** Address -> coordinates. Returns undefined when the address is unparseable. */
export function geocode(input: string, layout: CityLayout): GeocodeResult | undefined {
  const address = parseAddress(input, layout)
  if (!address) return undefined
  return { ...address, position: polarToPosition(layout, address.clock, address.distanceFeet) }
}

/**
 * Coordinates -> nearest street address. Snaps the clock to the nearest 15
 * minutes and the radius to the nearest annular street when it is within half
 * a block, which is how people actually describe where they are.
 */
export function reverseGeocode(position: Position, layout: CityLayout): PlayaAddress {
  const { minutes, distanceFeet } = positionToPolar(layout, position)
  const clock = minutesToClock(Math.round(minutes / 15) * 15)

  let nearest: { ref: string; name: string; distance: Feet } | undefined
  let best = Infinity
  for (const s of layout.cStreets) {
    const delta = Math.abs(s.distance - distanceFeet)
    if (delta < best) {
      best = delta
      nearest = s
    }
  }

  // Half a city block is ~140 ft; beyond that, call it open playa.
  if (nearest && best <= 140) {
    return {
      clock,
      distanceFeet: nearest.distance,
      street: nearest.ref,
      label: `${nearest.name} & ${clock}`,
    }
  }
  const rounded = Math.round(distanceFeet / 50) * 50
  return { clock, distanceFeet: rounded, label: `${clock} & ${rounded}'` }
}

function normaliseClock(token: string): string {
  return minutesToClock(clockToMinutes(token))
}

function resolve(layout: CityLayout, r: Feet | string): Feet {
  if (typeof r === 'number') return r
  const s = findAnnular(layout, r)
  return s ? s.distance : 0
}
