import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CityLayout } from '../layout'
import { bearingToClock, clockToBearing, distanceBetween, minutesToClock, polarToPosition } from '../geo'
import { geocode, intersectionExists, parseAddress, reverseGeocode } from '../geocode'
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

/**
 * Streets have real gaps and not every radial reaches every ring — issue
 * #52 — so a hand-picked street/clock pair (as this file used to use, e.g.
 * "D & 3:15") can fail to name a real intersection at all once a future
 * year's survey changes. Finding one dynamically keeps these tests about
 * what they say they are about rather than about whether the fixture pair
 * still happens to exist this year.
 */
function coveredIntersection(): { streetRef: string; streetName: string; clock: string } | undefined {
  for (const street of layout.cStreets) {
    const clock = layout.tStreets
      .flatMap((radial) => radial.refs)
      .find((ref) => intersectionExists(layout, ref, street.ref))
    if (clock) return { streetRef: street.ref, streetName: street.name, clock }
  }
  return undefined
}

describe('address parsing', () => {
  it('accepts street and clock in either order', () => {
    const found = coveredIntersection()
    expect(found, 'no surveyed street/radial intersection exists to test against').toBeDefined()
    const { streetName, clock } = found!
    const a = geocode(`${streetName} & ${clock}`, layout)
    const b = geocode(`${clock} & ${streetName}`, layout)
    expect(a?.position).toEqual(b?.position)
    expect(a?.label).toBe(`${streetName} & ${clock}`)
  })

  it('accepts full street names', () => {
    expect(geocode('7:30 & Esplanade', layout)?.label).toBe('Esplanade & 7:30')
    // Whatever this year calls them, every published name resolves to its
    // ref — checked at a clock the survey actually carries that street and a
    // reaching radial at, not an arbitrary "4:00" that may sit in a gap or
    // outrun every radial (issue #52: streets have real gaps and not every
    // ring reaches every clock, so a blanket clock here would only prove the
    // pre-fix bug, not the name lookup this test is actually about).
    for (const street of layout.cStreets) {
      const clock = layout.tStreets
        .flatMap((radial) => radial.refs)
        .find((ref) => intersectionExists(layout, ref, street.ref))
      if (!clock) continue
      expect(geocode(`${street.name} & ${clock}`, layout)?.street).toBe(street.ref)
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
    const found = coveredIntersection()
    expect(found, 'no surveyed street/radial intersection exists to test against').toBeDefined()
    const { streetName, clock } = found!
    const addresses = [`${streetName} & ${clock}`]
    // Esplanade runs the whole ring in every real year, so 7:30 on it is
    // always covered — kept as a second, independent example alongside the
    // dynamically discovered one above.
    if (intersectionExists(layout, '7:30', 'esplanade')) addresses.push('Esplanade & 7:30')
    for (const address of addresses) {
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

/**
 * Issue #52: `parseAddress`/`reverseGeocode` used to check only that a named
 * annular street existed somewhere, never whether its `segments` actually
 * covered the requested clock, or whether a radial reached out that far at
 * all. A fixture layout with a real gap and a short radial is what exercises
 * that — a layout where every street happens to run the full 360° (or every
 * radial reaches every ring) would pass both the old, buggy code and the fix
 * alike, and prove nothing.
 */
describe('street/radial coverage (issue #52)', () => {
  const COVERAGE_LAYOUT: CityLayout = {
    center: {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [-119.2, 40.78] },
    },
    bearing: 45,
    fence_distance: 10560,
    road_width: 40,
    cStreets: [
      { ref: 'esplanade', name: 'Esplanade', distance: 2500, segments: [['2:00', '10:00']] },
      // A gap from 5:30 to 8:00, the way Center Camp breaks a real ring.
      { ref: 'c', name: 'C', distance: 3000, segments: [['2:00', '5:30'], ['8:00', '10:00']] },
      // Only reachable where a radial actually runs that far out.
      { ref: 'k', name: 'K', distance: 5000, segments: [['2:00', '10:00']] },
    ],
    tStreets: [
      // Reaches all the way to K.
      { refs: ['3:00'], segments: [[0, 'k']] },
      // Stops at C — never reaches K.
      { refs: ['5:00'], segments: [[0, 'c']] },
      // 9:00 has no surveyed radial in this fixture at all.
    ],
    plazas: [],
    portals: [],
  }

  describe('intersectionExists', () => {
    it('is true for a clock inside a covered segment with a reaching radial', () => {
      expect(intersectionExists(COVERAGE_LAYOUT, '3:00', 'esplanade')).toBe(true)
      expect(intersectionExists(COVERAGE_LAYOUT, '5:00', 'c')).toBe(true)
    })
    it('is false for a clock that sits in an annular gap', () => {
      expect(intersectionExists(COVERAGE_LAYOUT, '6:00', 'c')).toBe(false)
    })
    it('is false when no radial is surveyed at that clock at all', () => {
      expect(intersectionExists(COVERAGE_LAYOUT, '9:00', 'c')).toBe(false)
    })
    it('is false when the radial stops short of the requested ring', () => {
      expect(intersectionExists(COVERAGE_LAYOUT, '5:00', 'k')).toBe(false)
    })
  })

  describe('parseAddress / geocode', () => {
    it('does not resolve an annular street outside its surveyed segments', () => {
      expect(parseAddress('6:00 & C', COVERAGE_LAYOUT)).toBeUndefined()
      expect(parseAddress('C & 6:00', COVERAGE_LAYOUT)).toBeUndefined()
    })
    it('does not invent an intersection at a clock with no surveyed radial', () => {
      expect(parseAddress('9:00 & C', COVERAGE_LAYOUT)).toBeUndefined()
    })
    it('does not let a short radial reach an outer ring it never touches', () => {
      expect(parseAddress('5:00 & K', COVERAGE_LAYOUT)).toBeUndefined()
    })
    it('still resolves a real, covered intersection', () => {
      expect(parseAddress('3:00 & K', COVERAGE_LAYOUT)).toEqual({
        clock: '3:00',
        distanceFeet: 5000,
        street: 'k',
        label: 'K & 3:00',
      })
      expect(geocode('K & 3:00', COVERAGE_LAYOUT)?.street).toBe('k')
    })
  })

  describe('reverseGeocode', () => {
    it('does not label a point in a missing segment as that street', () => {
      const pos = polarToPosition(COVERAGE_LAYOUT, '6:00', 3000)
      expect(reverseGeocode(pos, COVERAGE_LAYOUT).street).toBeUndefined()
    })
    it('does not label a point as on a ring no radial reaches at that clock', () => {
      const pos = polarToPosition(COVERAGE_LAYOUT, '5:00', 5000)
      expect(reverseGeocode(pos, COVERAGE_LAYOUT).street).toBeUndefined()
    })
    it('still snaps to the street in a genuinely covered segment', () => {
      const pos = polarToPosition(COVERAGE_LAYOUT, '3:00', 3000)
      const result = reverseGeocode(pos, COVERAGE_LAYOUT)
      expect(result.street).toBe('c')
      expect(result.label).toBe('C & 3:00')
    })
  })
})
