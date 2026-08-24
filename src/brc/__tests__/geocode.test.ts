import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CityLayout } from '../layout'
import { bearingToClock, clockToBearing, distanceBetween, minutesToClock } from '../geo'
import { geocode, parseAddress, reverseGeocode } from '../geocode'
import { DATA_YEAR } from '../../config'

const base = `public/data/${DATA_YEAR}`
const layout = JSON.parse(readFileSync(`${base}/layout.json`, 'utf8')) as CityLayout

/**
 * The whole map hangs off this arithmetic being right, and "right" is
 * checkable against the listings Burning Man publishes: every placed camp
 * carries an address, so the parser can be held against a thousand real ones
 * rather than a handful of hand-written fixtures.
 */
type Listing = {
  location_string?: string
  location?: { gps_latitude?: number; gps_longitude?: number }
}
const read = (name: string): Listing[] => {
  try {
    return JSON.parse(readFileSync(`${base}/${name}`, 'utf8')) as Listing[]
  } catch {
    return []
  }
}
const camps = read('camp.json')
const art = read('art.json')

/** A street the current year actually has, since the names change annually. */
const anyStreet = layout.cStreets[layout.cStreets.length - 1].name

describe('clock positions', () => {
  it('puts 12:00 on the city bearing', () => {
    expect(clockToBearing(layout, '12:00')).toBeCloseTo(layout.bearing, 6)
  })

  it('advances 30° per hour, clockwise', () => {
    expect(clockToBearing(layout, '3:00')).toBeCloseTo((layout.bearing + 90) % 360, 6)
    expect(clockToBearing(layout, '6:00')).toBeCloseTo((layout.bearing + 180) % 360, 6)
  })

  it('round-trips through bearing', () => {
    for (const clock of ['12:00', '2:15', '4:30', '7:45', '9:00', '11:30']) {
      expect(bearingToClock(layout, clockToBearing(layout, clock))).toBe(clock)
    }
  })

  it('normalises hour 12 and wraps past the hour', () => {
    expect(minutesToClock(0)).toBe('12:00')
    expect(minutesToClock(720)).toBe('12:00')
    expect(minutesToClock(-60)).toBe('11:00')
  })

  it('rejects things that are not clock positions', () => {
    expect(parseAddress('nonsense', layout)).toBeUndefined()
    expect(parseAddress('', layout)).toBeUndefined()
    expect(parseAddress('13:99', layout)).toBeUndefined()
  })
})

describe('address parsing', () => {
  it('accepts street and clock in either order', () => {
    const a = geocode('D & 3:15', layout)
    const b = geocode('3:15 & D', layout)
    expect(a?.position).toEqual(b?.position)
    // The streets are renamed every year, so read the name from the layout.
    expect(a?.label).toBe(`${layout.cStreets.find((s) => s.ref === 'd')!.name} & 3:15`)
  })

  it('accepts full street names', () => {
    expect(geocode('7:30 & Esplanade', layout)?.label).toBe('Esplanade & 7:30')
    // Whatever this year calls them, every published name resolves to its ref.
    for (const street of layout.cStreets) {
      expect(geocode(`${street.name} & 4:00`, layout)?.street).toBe(street.ref)
    }
  })

  it('accepts open-playa distances, as art listings use', () => {
    const at = geocode("12:00 2500', Open Playa", layout)
    expect(at?.distanceFeet).toBe(2500)
    expect(at?.clock).toBe('12:00')
  })

  it('resolves named plazas and portals', () => {
    expect(geocode('9:00 B Plaza', layout)?.clock).toBe('9:00')
    // The survey marks the portals on the Esplanade, at the mouth of the radial.
    expect(geocode('3:00 Portal', layout)?.street).toBe('esplanade')
  })
})

describe('address forms on plazas and portals', () => {
  it('places a camp on the rim of its plaza, not at the centre', () => {
    const rim = geocode('9:00 B Plaza @ 4:45', layout)!
    const centre = geocode('9:00 B Plaza', layout)!
    // Addresses drop the ampersand the survey publishes; both name one plaza.
    expect(rim.plaza).toBe('9:00 & B Plaza')
    // The rim is half a plaza diameter out from the centre.
    expect(distanceBetween(rim.position, centre.position)).toBeCloseTo(100 / 3.28084, 1)
  })

  it('knows Center Camp has its own, larger radius', () => {
    const rim = geocode('Center Camp Plaza @ 7:30', layout)!
    expect(rim.plaza).toBe('Center Camp Plaza')
    expect(rim.distanceFeet).toBe(layout.center_camp!.cafe_plaza_radius)
  })

  it('treats a portal in an intersection as its clock radial', () => {
    expect(geocode('4:30 Portal & A', layout)?.position).toEqual(
      geocode('A & 4:30', layout)?.position,
    )
  })
})

/**
 * The official archive publishes addresses for camps and surveyed GPS for art,
 * so the parser and coordinate math can be held against real public data rather
 * than a handful of hand-written fixtures.
 */
describe.runIf(camps.length > 0)('against the official published listings', () => {
  const placed = art.filter(
    (c) => c.location_string && c.location?.gps_latitude != null && c.location.gps_longitude != null,
  )

  const errorFor = (camp: (typeof placed)[number]) => {
    const result = geocode(camp.location_string!, layout)
    if (!result) return undefined
    return distanceBetween(result.position, [
      camp.location!.gps_longitude!,
      camp.location!.gps_latitude!,
    ])
  }

  it('parses the public camp-address corpus', () => {
    const addressed = camps.filter((camp) => camp.location_string)
    expect(addressed.length).toBeGreaterThan(1000)
    const unparsed = addressed.filter((camp) => !parseAddress(camp.location_string!, layout))
    // Anything with a clock position is placeable and must parse. A handful of
    // camps are instead listed against a named service road the city layout
    // does not describe — "Airport Road" — which has no polar position to find.
    expect(unparsed.filter((camp) => /\d:\d\d/.test(camp.location_string!))).toEqual([])
    expect(unparsed.length / addressed.length).toBeLessThan(0.01)
  })

  // Art positions are withheld until Gates open, so in the run-up to the event
  // this corpus is empty by design rather than by failure.
  it.runIf(placed.length > 0)('parses every published art address', () => {
    expect(placed.length).toBeGreaterThan(300)
    const unparsed = placed.filter((c) => !parseAddress(c.location_string!, layout))
    expect(unparsed.map((c) => c.location_string)).toEqual([])
  })

  /**
   * Art GPS is the only surveyed position the official archive publishes for a
   * listing, and it is a loose check by nature: a piece is placed on open playa
   * near its assigned address, not on it, so the residual grows with distance
   * from the Man and says more about placement than about the layout.
   *
   * The strict geometric check is `survey.test.ts`, which holds the layout
   * against Burning Man's own surveyed control points and requires every plaza
   * to sit within a foot of its street. That is far tighter than anything this
   * corpus can show.
   */
  it.runIf(placed.length > 0)('stays close to surveyed art GPS', () => {
    const errors = placed
      .map(errorFor)
      .filter((e): e is number => e !== undefined)
      .sort((a, b) => a - b)

    expect(errors.length).toBeGreaterThan(300)
    const median = errors[Math.floor(errors.length / 2)]
    const worst = errors[errors.length - 1]
    // Naming the numbers means a regression says how far it drifted, not just
    // that it did.
    expect(median, `median art error was ${median.toFixed(2)} m`).toBeLessThan(2.5)
    expect(worst, `worst art error was ${worst.toFixed(2)} m`).toBeLessThan(8)
  })
})

describe('reverse geocoding', () => {
  it('snaps back to the address it came from', () => {
    for (const address of ['D & 3:15', 'Esplanade & 7:30', `${anyStreet} & 9:00`]) {
      const forward = geocode(address, layout)!
      expect(reverseGeocode(forward.position, layout).label).toBe(forward.label)
    }
  })

  it('calls open playa open playa rather than snapping to a far street', () => {
    const middle = geocode("12:00 1200'", layout)!
    const back = reverseGeocode(middle.position, layout)
    expect(back.street).toBeUndefined()
    expect(back.label).toMatch(/^12:00 & \d+'$/)
  })
})
