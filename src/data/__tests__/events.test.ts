import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { formatWhen, occurrencesInWindow, relevantOccurrence, resolveEventLocation, scheduleClock } from '../events'
import type { CityLayout } from '../../brc/layout'
import { DATA_YEAR } from '../../config'
import type { EventItem, Poi } from '../types'

const at = (start: string, end: string) => ({ start_time: start, end_time: end })

const event = (title: string, occurrences: { start_time: string; end_time: string }[]): EventItem => ({
  uid: title,
  title,
  event_id: 1,
  year: 2026,
  occurrence_set: occurrences,
})

const NOW = new Date('2026-09-02T21:00:00-07:00')

const EVENTS = [
  event('running', [at('2026-09-02T20:00:00-07:00', '2026-09-02T23:00:00-07:00')]),
  event('soon', [at('2026-09-02T22:00:00-07:00', '2026-09-02T23:30:00-07:00')]),
  event('later tonight', [at('2026-09-02T23:45:00-07:00', '2026-09-03T01:00:00-07:00')]),
  event('tomorrow', [at('2026-09-03T14:00:00-07:00', '2026-09-03T15:00:00-07:00')]),
  event('finished', [at('2026-09-02T10:00:00-07:00', '2026-09-02T11:00:00-07:00')]),
]

const titles = (window: Parameters<typeof occurrencesInWindow>[1]) =>
  occurrencesInWindow(EVENTS, window, NOW).map((live) => live.event.title)

describe('event windows', () => {
  it('"now" is only what is actually running', () => {
    expect(titles('now')).toEqual(['running'])
  })

  it('"next 3h" includes what is running and what starts soon', () => {
    expect(titles('next3h')).toEqual(['running', 'soon', 'later tonight'])
  })

  it('"today" stops at the playa\'s midnight, not a rolling 24 hours', () => {
    expect(titles('today')).toEqual(['running', 'soon', 'later tonight'])
  })

  /**
   * People arrive with phones still set to the timezone they flew from. The
   * schedule has to roll over at the playa's midnight regardless.
   */
  it('"today" is the same day whatever timezone the device is in', () => {
    const original = process.env.TZ
    const seen = new Set<string>()
    for (const tz of ['UTC', 'America/New_York', 'Australia/Sydney', 'America/Los_Angeles']) {
      process.env.TZ = tz
      seen.add(titles('today').join(','))
    }
    process.env.TZ = original
    expect([...seen]).toEqual(['running,soon,later tonight'])
  })

  it('"all" returns every occurrence in start order', () => {
    expect(titles('all')).toEqual(['finished', 'running', 'soon', 'later tonight', 'tomorrow'])
  })

  it('expands repeating events into separate showings', () => {
    const repeating = [
      event('nightly', [
        at('2026-09-02T20:30:00-07:00', '2026-09-02T21:30:00-07:00'),
        at('2026-09-03T20:30:00-07:00', '2026-09-03T21:30:00-07:00'),
      ]),
    ]
    expect(occurrencesInWindow(repeating, 'all', NOW)).toHaveLength(2)
    expect(occurrencesInWindow(repeating, 'now', NOW)).toHaveLength(1)
  })
})

describe('the schedule clock', () => {
  const range = { startDate: '2026-08-30T00:00:00-07:00', endDate: '2026-09-07T12:00:00-07:00' }

  it('uses the real time during the event', () => {
    expect(scheduleClock(range, NOW)).toEqual({ now: NOW, preview: false })
  })

  it('scrubs to the start of the burn the rest of the year', () => {
    const january = new Date('2026-01-15T09:00:00-08:00')
    const clock = scheduleClock(range, january)
    expect(clock.preview).toBe(true)
    expect(clock.now.toISOString()).toBe(new Date(range.startDate).toISOString())
  })

  it('leaves the clock alone when the year has no published range', () => {
    expect(scheduleClock(undefined, NOW)).toEqual({ now: NOW, preview: false })
  })
})

describe('relative times', () => {
  it('says an event is on without a countdown while there is plenty of time', () => {
    const [live] = occurrencesInWindow(EVENTS, 'now', NOW)
    expect(formatWhen(live, NOW)).toBe('on now')
  })

  it('counts down once it is nearly over, which is when it matters', () => {
    const nearlyDone = new Date('2026-09-02T22:35:00-07:00')
    const [live] = occurrencesInWindow(EVENTS, 'now', nearlyDone)
    expect(formatWhen(live, nearlyDone)).toBe('on now · 25 min left')
  })

  it('counts up to what is starting soon', () => {
    const soon = occurrencesInWindow(EVENTS, 'next3h', NOW)[1]
    expect(formatWhen(soon, NOW)).toBe('in 60 min')
  })

  it('falls back to a weekday and time further out', () => {
    const tomorrow = occurrencesInWindow(EVENTS, 'all', NOW).at(-1)!
    expect(formatWhen(tomorrow, NOW)).toMatch(/^Thu/)
  })

  /**
   * The absolute time shown here is playa time regardless of the phone's own
   * timezone — a device still set to where the visitor flew from should not
   * see the schedule shift.
   */
  it('renders the same absolute time on non-Pacific device timezones', () => {
    const tomorrow = occurrencesInWindow(EVENTS, 'all', NOW).at(-1)!
    const original = process.env.TZ
    const seen = new Set<string>()
    for (const tz of ['UTC', 'America/New_York', 'Australia/Sydney']) {
      process.env.TZ = tz
      seen.add(formatWhen(tomorrow, NOW))
    }
    process.env.TZ = original
    expect([...seen]).toHaveLength(1)
    expect([...seen][0]).toMatch(/^Thu.*2/)
  })
})

describe('relevantOccurrence', () => {
  const repeating = event('nightly', [
    at('2026-08-30T20:00:00-07:00', '2026-08-30T21:00:00-07:00'),
    at('2026-09-01T20:00:00-07:00', '2026-09-01T21:00:00-07:00'),
    at('2026-09-03T20:00:00-07:00', '2026-09-03T21:00:00-07:00'),
    at('2026-09-05T20:00:00-07:00', '2026-09-05T21:00:00-07:00'),
  ])

  it('picks the showing that is currently running', () => {
    const midShow = new Date('2026-09-03T20:30:00-07:00')
    const result = relevantOccurrence(repeating, midShow)
    expect(result?.state).toBe('running')
    expect(result?.occurrence.start_time).toBe('2026-09-03T20:00:00-07:00')
  })

  it('picks the next upcoming showing between occurrences', () => {
    const betweenShows = new Date('2026-09-02T12:00:00-07:00')
    const result = relevantOccurrence(repeating, betweenShows)
    expect(result?.state).toBe('upcoming')
    expect(result?.occurrence.start_time).toBe('2026-09-03T20:00:00-07:00')
  })

  it('falls back to the most recently ended showing once every occurrence is over', () => {
    const afterAll = new Date('2026-09-06T12:00:00-07:00')
    const result = relevantOccurrence(repeating, afterAll)
    expect(result?.state).toBe('ended')
    expect(result?.occurrence.start_time).toBe('2026-09-05T20:00:00-07:00')
  })
})

/**
 * Issue #29: an event without a resolved host used to say "location not
 * listed" even when `other_location` plainly had something in it. These
 * three states need to stay told apart: no host and nothing in
 * `other_location` at all; `other_location` present but not something the
 * geocoder can resolve; and `other_location` that parses as a real playa
 * address, which should behave like one (distance, navigation) without
 * pretending to be a registered host.
 *
 * Wrapped in a plain `if`, not `describe.runIf`: vitest still calls a
 * `describe.runIf` callback to collect its tests regardless of the
 * condition, so the `readFileSync` below would throw during collection on a
 * checkout that has fetched a different year's data than `DATA_YEAR` names
 * (CI fetches one year and only one) even though the block was meant to be
 * skipped. An `if` around the whole `describe` call never invokes it at all.
 */
const layoutPath = `public/data/${DATA_YEAR}/layout.json`
if (existsSync(layoutPath)) {
  describe('resolveEventLocation', () => {
    const layout = JSON.parse(readFileSync(layoutPath, 'utf8')) as CityLayout

    const host: Poi = {
      uid: 'camp-1',
      kind: 'camp',
      name: 'Test Camp',
      position: [-119.203, 40.786],
      positionSource: 'gps',
      accuracyClass: 'surveyed',
    }

    const baseEvent: EventItem = {
      uid: 'evt-1',
      title: 'Test Event',
      event_id: 1,
      year: 2026,
      occurrence_set: [],
    }

    it('prefers a registered host over anything in other_location', () => {
      const event = { ...baseEvent, other_location: 'D & 3:15' }
      expect(resolveEventLocation(event, host, layout)).toEqual({ kind: 'host', poi: host })
    })

    it('reports no location when there is no host and no other_location', () => {
      expect(resolveEventLocation(baseEvent, undefined, layout)).toEqual({ kind: 'none' })
    })

    it('reports no location for a blank/whitespace-only other_location', () => {
      const event = { ...baseEvent, other_location: '   ' }
      expect(resolveEventLocation(event, undefined, layout)).toEqual({ kind: 'none' })
    })

    it('resolves a parseable playa address in other_location, without a host', () => {
      const event = { ...baseEvent, other_location: 'D & 3:15' }
      const result = resolveEventLocation(event, undefined, layout)
      expect(result.kind).toBe('geocoded')
      if (result.kind === 'geocoded') {
        expect(result.label).toBe('D & 3:15')
        expect(result.position).toBeDefined()
      }
    })

    it('keeps unparseable free-form text as its own state, not folded into "not listed"', () => {
      const event = { ...baseEvent, other_location: 'ask around at the tiki bar' }
      expect(resolveEventLocation(event, undefined, layout)).toEqual({
        kind: 'unmapped',
        label: 'ask around at the tiki bar',
      })
    })
  })
}
