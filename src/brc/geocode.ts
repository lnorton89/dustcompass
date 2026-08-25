import type { CityLayout, Feet, RadialStreet } from './layout'
import { findAnnular, resolveRadius } from './layout'
import {
  clockToBearing,
  clockToMinutes,
  destination,
  feetToMeters,
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
  /** Plaza name when the address is a position on a plaza rim. */
  plaza?: string
  /** Human-readable form, e.g. "D & 3:15" or "12:00 & 2500'". */
  label: string
}

export interface GeocodeResult extends PlayaAddress {
  position: Position
}

/**
 * A plaza address is not a point on a street. Plazas are circles, and camps on
 * them are placed around the rim by a clock face of their own — "9:00 B Plaza
 * @ 4:45" is the 4:45 position on the rim of the plaza at 9:00 and B. The rim
 * clock uses the same city rotation as the street grid.
 */
interface PlazaCircle {
  centre: Position
  radiusFeet: Feet
  name: string
}

function findPlaza(layout: CityLayout, name: string): PlazaCircle | undefined {
  const wanted = normaliseLandmark(name)

  const plaza = layout.plazas.find((p) => normaliseLandmark(p.name) === wanted)
  if (plaza) {
    return {
      centre: polarToPosition(layout, plaza.time, resolve(layout, plaza.distance)),
      radiusFeet: plaza.diameter / 2,
      name: plaza.name,
    }
  }

  // Center Camp is described separately from the plaza list.
  const cc = layout.center_camp
  if (cc && /^center camp( plaza)?$/.test(wanted)) {
    return {
      centre: polarToPosition(layout, '6:00', cc.distance),
      radiusFeet: cc.cafe_plaza_radius,
      name: 'Center Camp Plaza',
    }
  }
  return undefined
}

/**
 * Minutes, not any two digits. `2:60` used to satisfy this, reach
 * `clockToMinutes` and throw — and both the search box and the `?at=`
 * parameter of a shared link call straight through here, so a malformed
 * address took the render down rather than simply failing to match.
 */
const CLOCK = String.raw`(?:[1-9]|1[0-2])[:.][0-5]\d`

/**
 * Parse the address forms that appear in Burning Man's own data and on street
 * signs. All of these resolve:
 *
 *   "D & 3:15"            "3:15 & D"           "7:30 & Esplanade"
 *   "Esplanade & 7:30"    "12:00 2500'"        "4:30 2000 feet"
 *   "9:00 B Plaza"        "3:00 Portal"        "Center Camp Plaza"
 */
/**
 * Landmark names are written differently everywhere they appear. The survey
 * publishes "9:00 & B Plaza" and marks the same place "9 & B Plaza"; camp
 * addresses say "9:00 B Plaza"; portals are "300 Portal" in the survey and
 * "3:00 Portal" on a sign. They are one place, so reduce every spelling of a
 * clock to one before comparing.
 */
function normaliseLandmark(name: string): string {
  return name
    .toLowerCase()
    .split(/[\s&]+/)
    .filter(Boolean)
    .map((token) => {
      if (/^\d{1,2}$/.test(token)) return `${Number(token)}:00`
      if (/^\d{3,4}$/.test(token)) return `${Number(token.slice(0, -2))}:${token.slice(-2)}`
      const clock = /^(\d{1,2}):(\d{2})$/.exec(token)
      return clock ? `${Number(clock[1])}:${clock[2]}` : token
    })
    .join(' ')
}

/**
 * Whether `targetMinutes` falls within the arc `[fromClock, toClock]` spans,
 * clockwise from `fromClock`, wrapping past 12:00 exactly the way `arc()` in
 * `city.ts` interprets the same pair when it draws the segment. Keeping the
 * two in agreement matters: a clock this says is covered but `arc()` does
 * not actually draw would resolve an address to a street that isn't there.
 */
function withinArc(fromClock: string, toClock: string, targetMinutes: number): boolean {
  const start = clockToMinutes(fromClock)
  let end = clockToMinutes(toClock)
  if (end <= start) end += 720
  const span = end - start
  const rel = ((targetMinutes - start) % 720 + 720) % 720
  return rel <= span
}

/**
 * Whether a `clock & street` address names a place that actually exists.
 * Annular streets have real gaps — Center Camp, a plaza, open playa — so the
 * street has to cover this clock, not merely exist somewhere on the ring.
 * And the clock itself has to be a real radial whose own segments reach out
 * far enough to meet this annular street's radius; a radial can stop short
 * of the outer rings, and a clock with no radial at all names no
 * intersection regardless of what the annular street does there.
 */
function radialReaches(layout: CityLayout, radial: RadialStreet, streetDistance: Feet): boolean {
  return radial.segments.some(([from, to]) => {
    const lo = resolveRadius(layout, from)
    const hi = resolveRadius(layout, to)
    return streetDistance >= Math.min(lo, hi) && streetDistance <= Math.max(lo, hi)
  })
}

export function intersectionExists(layout: CityLayout, clock: string, streetRef: string): boolean {
  const street = layout.cStreets.find((s) => s.ref === streetRef)
  if (!street) return false
  const target = clockToMinutes(clock)

  const findRadial = (minutes: number) =>
    layout.tStreets.find((r) => r.refs.some((ref) => clockToMinutes(ref) === minutes))
  const radial = findRadial(target)

  const annularCovers = street.segments.some(([from, to]) => withinArc(from, to, target))
  if (annularCovers && radial && radialReaches(layout, radial, street.distance)) return true

  // A radial whose own segment names this exact street as one of its
  // endpoints is direct structural evidence of a real junction there,
  // whether or not the annular street's own arc list happens to enumerate
  // that clock as covered. Center Camp's own Esplanade entrance is exactly
  // this shape in real survey data: the 6:00 radial's segments run
  // `[2223, "esplanade"]`, a real recorded junction, even though Esplanade's
  // own arc list shows a gap spanning that clock — the ring's arc and a
  // radial's junction points are derived separately and do not always agree
  // on exactly where a gap starts and ends.
  if (radial?.segments.some(([from, to]) => from === streetRef || to === streetRef)) return true

  // Minor quarter-hour spokes are frequently surveyed only from the outer
  // blocks in — real BRC road infrastructure only exists there, not a gap
  // in the address grid. A camp addressed "D & 7:15" is real even where the
  // 7:15 spoke itself is only drawn from F outward: the block between the
  // flanking hour/half-hour radials belongs to the ring the moment both of
  // them reach it, whether or not the minor cross-spoke between them — or
  // the ring's own arc list, which has the same coarse-derivation gaps as
  // above — was separately traced all the way to it.
  if (target % 30 !== 0) {
    const lowerMinutes = Math.floor(target / 30) * 30
    const upperMinutes = (lowerMinutes + 30) % 720
    const lower = findRadial(lowerMinutes)
    const upper = findRadial(upperMinutes)
    return Boolean(
      lower && radialReaches(layout, lower, street.distance) && upper && radialReaches(layout, upper, street.distance),
    )
  }
  return false
}

export function parseAddress(input: string, layout: CityLayout): PlayaAddress | undefined {
  const raw = input.trim()
  if (!raw) return undefined

  // Named plazas and portals win outright — they are landmarks, not intersections.
  const named = [...layout.plazas, ...layout.portals].find(
    (p) => normaliseLandmark(p.name) === normaliseLandmark(raw),
  )
  if (named) {
    return {
      clock: named.time,
      distanceFeet: resolve(layout, named.distance),
      street: typeof named.distance === 'string' ? named.distance : undefined,
      label: named.name,
    }
  }

  // "2:00 B Plaza & B" — the plaza, named alongside the street it sits on.
  // The street adds nothing the plaza does not already fix, so drop it.
  const plazaOnStreet = /^(.*plaza)\s*&\s*(.+)$/i.exec(raw)
  if (plazaOnStreet && findPlaza(layout, plazaOnStreet[1])) {
    const plaza = findPlaza(layout, plazaOnStreet[1])!
    const declared = layout.plazas.find((p) => normaliseLandmark(p.name) === normaliseLandmark(plaza.name))
    if (declared) {
      return {
        clock: declared.time,
        distanceFeet: resolve(layout, declared.distance),
        street: typeof declared.distance === 'string' ? declared.distance : undefined,
        plaza: declared.name,
        label: declared.name,
      }
    }
  }

  // "<plaza> @ <clock>" — a position on a plaza rim.
  const onPlaza = new RegExp(String.raw`^(.+?)\s*@\s*(${CLOCK})$`, 'i').exec(raw)
  if (onPlaza) {
    const plaza = findPlaza(layout, onPlaza[1])
    if (plaza) {
      const clock = normaliseClock(onPlaza[2])
      return {
        clock,
        distanceFeet: plaza.radiusFeet,
        plaza: plaza.name,
        label: `${plaza.name} @ ${clock}`,
      }
    }
  }

  // "<clock> <feet>" — open playa, the form art listings use.
  // The trailing guard matters: without it the hour of a second clock reads
  // as a distance, and "10:00 & 10:00 B Plaza" pins ten feet from the Man
  // instead of on a plaza a kilometre away.
  const open = new RegExp(String.raw`^(${CLOCK})\s*[,&@]?\s*(\d{1,5})(?![\d:.])\s*(?:'|ft|feet)?\s*const open = new RegExp(String.raw`^(${CLOCK})\s*[,&@]?\s*(\d{1,5})(?![\d:.])\s*(?:'|ft|feet), 'i').exec(raw)
  if (open) {
    const clock = normaliseClock(open[1])
    return {
      clock,
      distanceFeet: Number(open[2]),
      label: `${clock} & ${open[2]}'`,
    }
  }

  // "<clock> & <street>" or "<street> & <clock>", in either order.
  const parts = raw
    // `and` and `at` are separators only as words. Without the boundaries,
    // "Atwood & 7:45" splits inside the street name and shared pins cannot be
    // restored after a reload.
    .split(/\s*(?:&|\/|\band\b|\bat\b)\s*/i)
    .filter(Boolean)
    // "3:00 Portal & A" is the 3:00 radial meeting A — the portal is a gap in
    // the ring at that clock, not a separate place.
    .map((part) => part.replace(/\s*portal\s*$/i, '').trim())
  if (parts.length >= 2) {
    const clockPart = parts.find((p) => new RegExp(`^${CLOCK}$`).test(p.trim()))
    const streetPart = parts.find((p) => p !== clockPart)
    if (clockPart && streetPart) {
      const street = findAnnular(layout, streetPart)
      if (street) {
        const clock = normaliseClock(clockPart)
        // The street exists somewhere on the ring, but that clock may sit in
        // a gap it does not actually cover, or reach a radial that stops
        // short of this radius. Either way there is no intersection here.
        if (intersectionExists(layout, clock, street.ref)) {
          return {
            clock,
            distanceFeet: street.distance,
            street: street.ref,
            label: `${street.name} & ${clock}`,
          }
        }
      } else {
        // Some listings name a plaza on the far side of the ampersand —
        // "10:00 & 10:00 B Plaza". The plaza is the more specific place, and it
        // already knows where it is.
        const plaza = findPlaza(layout, streetPart)
        if (plaza) {
          const clock = normaliseClock(clockPart)
          return {
            clock,
            distanceFeet: plaza.radiusFeet,
            plaza: plaza.name,
            label: `${plaza.name} @ ${clock}`,
          }
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

  if (address.plaza) {
    const plaza = findPlaza(layout, address.plaza)
    if (plaza) {
      return {
        ...address,
        position: destination(
          plaza.centre,
          feetToMeters(plaza.radiusFeet),
          clockToBearing(layout, address.clock),
        ),
      }
    }
  }
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

  // Half a city block is ~140 ft; beyond that, call it open playa. Even
  // within that, the nearest ring by radius alone can still be a street that
  // does not run at this clock — a gap, or no radial reaching this far out —
  // so the same coverage check forward geocoding uses applies here too.
  if (nearest && best <= 140 && intersectionExists(layout, clock, nearest.ref)) {
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
