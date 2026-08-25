import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  embargoNote,
  redactEmbargoedLocations,
  RELEASE_2026,
  releaseForYear,
  sanitizeEventOccurrences,
  summarize,
  validateDataset,
} from '../api.mjs'

/**
 * The listings in public/data came from this same API, so they are a real
 * fixture for what a good response looks like — not a hand-written guess at it.
 */
const YEAR = process.env.NEXT_PUBLIC_DATA_YEAR ?? '2026'
const load = (name) => JSON.parse(readFileSync(`public/data/${YEAR}/${name}.json`, 'utf8'))

/**
 * The files on disk have already been through the embargo, so a dataset whose
 * locations are still withheld is legitimately missing them. That is the one
 * thing `validateDataset` cannot tell apart from a response shape change, and
 * it does not need to: it runs on the raw response, before redaction.
 */
const release = releaseForYear(YEAR)
const withheld = (kind) => {
  const lifts = kind === 'art' ? release.art : kind === 'camp' ? release.camp : undefined
  return lifts !== undefined && new Date() < lifts
}
const shapeProblems = (kind) =>
  validateDataset(kind, load(kind)).problems.filter(
    (problem) => !(withheld(kind) && /"location(_string)?"/.test(problem)),
  )

describe('validating a real response', () => {
  it('accepts the shapes the app is built against', () => {
    for (const kind of ['art', 'camp', 'event']) {
      expect(shapeProblems(kind), `${kind} response shape`).toEqual([])
    }
  })

  it('still notices when a location field disappears outside an embargo', () => {
    const stripped = load('camp').map((camp) => {
      const copy = { ...camp }
      delete copy.location
      delete copy.location_string
      return copy
    })
    expect(validateDataset('camp', stripped).problems.length).toBeGreaterThan(0)
  })

  /** Not every camp is placed — some register without ever taking a spot. */
  it('counts how many records can actually be placed', () => {
    const camps = validateDataset('camp', load('camp'))
    expect(camps.total).toBeGreaterThan(1000)
    expect(camps.located).toBeGreaterThan(camps.total * 0.95)
    expect(camps.located).toBeLessThanOrEqual(camps.total)
    expect(summarize('camp', camps)).toMatch(/^\d+ camps, \d+ with a location \(9\d%\)$/)
  })
})

describe('refusing a response the app cannot use', () => {
  it('rejects a non-array', () => {
    expect(validateDataset('camp', { camps: [] }).problems).toEqual([
      'camp: expected an array, got object',
    ])
  })

  it('rejects an empty year rather than writing an empty map', () => {
    expect(validateDataset('art', []).problems[0]).toMatch(/empty/)
  })

  it('names the field that went missing', () => {
    const problems = validateDataset('camp', [{ name: 'No Uid Camp', location_string: 'D & 3:15' }])
      .problems
    expect(problems).toContain('camp: 1/1 records have no "uid"')
  })

  it('catches a renamed field even when the required ones survive', () => {
    const problems = validateDataset('camp', [{ uid: 'a', name: 'Renamed', placement: 'D & 3:15' }])
      .problems
    expect(problems.some((p) => p.includes('"location_string"'))).toBe(true)
  })
})

/**
 * A key present with the wrong runtime value — `null`, an object where an
 * array belongs, a non-string name — passes the old `=== undefined` check
 * but still crashes or corrupts the client downstream. These fixtures are
 * hand-written, not read from public/data, so they exercise exactly the
 * malformed shapes a real API response has produced before.
 */
describe('refusing malformed-but-present values', () => {
  it('rejects a record that is not an object', () => {
    const problems = validateDataset('camp', [null, { uid: 'a', name: 'Fine' }]).problems
    expect(problems).toContain('camp: 1/2 records are not objects')
  })

  it('rejects an array standing in for a record', () => {
    const problems = validateDataset('camp', [['uid', 'a']]).problems
    expect(problems).toContain('camp: 1/1 records are not objects')
  })

  it('treats a null occurrence_set as missing, not present', () => {
    const problems = validateDataset('event', [
      { uid: 'e1', title: 'Fire Talk', occurrence_set: null },
    ]).problems
    expect(problems).toContain('event: 1/1 records have no "occurrence_set"')
  })

  it('treats a non-array occurrence_set as missing', () => {
    const problems = validateDataset('event', [
      { uid: 'e1', title: 'Fire Talk', occurrence_set: {} },
    ]).problems
    expect(problems).toContain('event: 1/1 records have no "occurrence_set"')
  })

  it('treats a null title as missing', () => {
    const problems = validateDataset('event', [
      { uid: 'e1', title: null, occurrence_set: [] },
    ]).problems
    expect(problems).toContain('event: 1/1 records have no "title"')
  })

  it('treats a null name as missing', () => {
    const problems = validateDataset('camp', [{ uid: 'a', name: null }]).problems
    expect(problems).toContain('camp: 1/1 records have no "name"')
  })

  it('treats a blank-string name as missing', () => {
    const problems = validateDataset('camp', [{ uid: 'a', name: '   ' }]).problems
    expect(problems).toContain('camp: 1/1 records have no "name"')
  })

  it('flags duplicate uids within a dataset', () => {
    const problems = validateDataset('camp', [
      { uid: 'a', name: 'First' },
      { uid: 'a', name: 'Second' },
      { uid: 'b', name: 'Third' },
    ]).problems
    expect(problems).toContain('camp: uid "a" appears 2 times')
  })

  it('rejects an occurrence with an unparseable start time', () => {
    const problems = validateDataset('event', [
      {
        uid: 'e1',
        title: 'Fire Talk',
        occurrence_set: [{ start_time: 'not-a-date', end_time: '2026-08-30T12:00:00-07:00' }],
      },
    ]).problems
    expect(problems).toContain('event: 1 occurrence(s) have an unparseable or non-positive start/end time')
  })

  it('rejects an occurrence with a missing end time', () => {
    const problems = validateDataset('event', [
      {
        uid: 'e1',
        title: 'Fire Talk',
        occurrence_set: [{ start_time: '2026-08-30T12:00:00-07:00' }],
      },
    ]).problems
    expect(problems).toContain('event: 1 occurrence(s) have an unparseable or non-positive start/end time')
  })

  it('rejects an occurrence whose end is not after its start', () => {
    const problems = validateDataset('event', [
      {
        uid: 'e1',
        title: 'Fire Talk',
        occurrence_set: [
          { start_time: '2026-08-30T12:00:00-07:00', end_time: '2026-08-30T12:00:00-07:00' },
        ],
      },
    ]).problems
    expect(problems).toContain('event: 1 occurrence(s) have an unparseable or non-positive start/end time')
  })

  it('accepts an event whose bad occurrence has already been sanitized away', () => {
    const { records } = sanitizeEventOccurrences('event', [
      {
        uid: 'e1',
        title: 'Fire Talk',
        occurrence_set: [
          { start_time: 'not-a-date', end_time: '2026-08-30T12:00:00-07:00' },
          { start_time: '2026-08-30T12:00:00-07:00', end_time: '2026-08-30T13:00:00-07:00' },
        ],
      },
    ])
    const problems = validateDataset('event', records).problems
    expect(problems.some((p) => p.includes('occurrence'))).toBe(false)
  })

  it('accepts a well-formed occurrence', () => {
    const problems = validateDataset('event', [
      {
        uid: 'e1',
        title: 'Fire Talk',
        occurrence_set: [
          { start_time: '2026-08-30T12:00:00-07:00', end_time: '2026-08-30T13:00:00-07:00' },
        ],
      },
    ]).problems
    // Not toEqual([]): a single record legitimately trips the unrelated
    // "no record has event_type/hosted_by_camp" EXPECTED-field warning.
    expect(problems.some((p) => p.includes('occurrence'))).toBe(false)
  })

  it('rejects out-of-range GPS coordinates', () => {
    const problems = validateDataset('camp', [
      { uid: 'a', name: 'Off the map', location: { gps_latitude: 91, gps_longitude: 0 } },
    ]).problems
    expect(problems).toContain('camp: 1/1 records have invalid GPS coordinates')
  })

  it('rejects non-finite and wrong-type GPS coordinates', () => {
    const problems = validateDataset('art', [
      { uid: 'a1', name: 'NaN Piece', location: { gps_latitude: NaN, gps_longitude: 0 } },
      { uid: 'a2', name: 'String Piece', location: { gps_latitude: '40.7', gps_longitude: -119.2 } },
    ]).problems
    expect(problems).toContain('art: 2/2 records have invalid GPS coordinates')
  })

  it('accepts valid GPS coordinates', () => {
    const problems = validateDataset('camp', [
      { uid: 'a', name: 'Well Placed', location: { gps_latitude: 40.7864, gps_longitude: -119.2065 } },
    ]).problems
    // Not toEqual([]): a single record legitimately trips the unrelated
    // "no record has location_string" EXPECTED-field warning.
    expect(problems.some((p) => p.includes('GPS'))).toBe(false)
  })
})

describe('dropping bad occurrences instead of refusing the whole fetch', () => {
  it('drops an occurrence with an unparseable start, keeping a good one from the same event', () => {
    const { records, dropped } = sanitizeEventOccurrences('event', [
      {
        uid: 'e1',
        title: 'Fire Talk',
        occurrence_set: [
          { start_time: 'not-a-date', end_time: '2026-08-30T12:00:00-07:00' },
          { start_time: '2026-08-30T12:00:00-07:00', end_time: '2026-08-30T13:00:00-07:00' },
        ],
      },
    ])
    expect(records[0].occurrence_set).toHaveLength(1)
    expect(records[0].occurrence_set[0].start_time).toBe('2026-08-30T12:00:00-07:00')
    expect(dropped).toEqual([
      { uid: 'e1', title: 'Fire Talk', start: 'not-a-date', end: '2026-08-30T12:00:00-07:00' },
    ])
  })

  it('drops an event when its only occurrence is invalid', () => {
    const { records, dropped, droppedEvents } = sanitizeEventOccurrences('event', [
      {
        uid: 'e1',
        title: 'Fire Talk',
        occurrence_set: [
          { start_time: '2026-08-30T12:00:00-07:00', end_time: '2026-08-30T12:00:00-07:00' },
        ],
      },
    ])
    expect(records).toEqual([])
    expect(dropped).toHaveLength(1)
    expect(droppedEvents).toEqual([{ uid: 'e1', title: 'Fire Talk' }])
  })

  it('leaves a well-formed event untouched', () => {
    const good = {
      uid: 'e1',
      title: 'Fire Talk',
      occurrence_set: [{ start_time: '2026-08-30T12:00:00-07:00', end_time: '2026-08-30T13:00:00-07:00' }],
    }
    const { records, dropped } = sanitizeEventOccurrences('event', [good])
    expect(records[0]).toBe(good)
    expect(dropped).toEqual([])
  })

  it('leaves every other kind of record untouched', () => {
    const camps = [{ uid: 'a', name: 'Well Placed' }]
    const { records, dropped } = sanitizeEventOccurrences('camp', camps)
    expect(records).toBe(camps)
    expect(dropped).toEqual([])
  })

  it('does not retain an empty shell when every occurrence is bad', () => {
    const { records, droppedEvents } = sanitizeEventOccurrences('event', [
      {
        uid: 'e1',
        title: 'Fire Talk',
        occurrence_set: [{ start_time: 'not-a-date', end_time: 'also-not-a-date' }],
      },
    ])
    expect(records).toEqual([])
    expect(droppedEvents).toEqual([{ uid: 'e1', title: 'Fire Talk' }])
  })
})

describe('telling an embargo apart from a broken key', () => {
  const unlocated = { located: 0, total: 100 }

  it('says nothing when locations are present', () => {
    expect(embargoNote('camp', { located: 100, total: 100 })).toBeUndefined()
  })

  it('explains missing locations as the embargo before release', () => {
    const before = new Date('2026-08-10T12:00:00-07:00')
    expect(embargoNote('camp', unlocated, before, RELEASE_2026)).toMatch(/still embargoed/)
    expect(embargoNote('art', unlocated, before, RELEASE_2026)).toMatch(/still embargoed/)
  })

  it('flags missing locations as a key problem once released', () => {
    const afterGates = new Date('2026-08-31T12:00:00-07:00')
    expect(embargoNote('camp', unlocated, afterGates, RELEASE_2026)).toMatch(/check your API key/)
    expect(embargoNote('art', unlocated, afterGates, RELEASE_2026)).toMatch(/check your API key/)
  })

  it('knows camps release a week before art', () => {
    const between = new Date('2026-08-25T12:00:00-07:00')
    expect(embargoNote('camp', unlocated, between, RELEASE_2026)).toMatch(/check your API key/)
    expect(embargoNote('art', unlocated, between, RELEASE_2026)).toMatch(/still embargoed/)
  })

  it('has nothing to say about events, which carry no location', () => {
    expect(embargoNote('event', unlocated)).toBeUndefined()
  })
})

describe('redacting confidential location data before publishing', () => {
  const record = { uid: 'a', name: 'Placed', location_string: 'D & 3:15', location: { gps_latitude: 1 } }

  it('removes GPS and the geocodable address before release', () => {
    const [safe] = redactEmbargoedLocations(
      'art',
      [record],
      new Date('2026-08-20T12:00:00-07:00'),
      RELEASE_2026,
    )
    expect(safe).toEqual({ uid: 'a', name: 'Placed' })
  })

  it('does not alter released or event records', () => {
    expect(
      redactEmbargoedLocations('camp', [record], new Date('2026-08-24T12:00:00-07:00'), RELEASE_2026),
    ).toEqual([record])
    expect(redactEmbargoedLocations('event', [record], new Date(0), RELEASE_2026)).toEqual([record])
  })

  it('refuses an unreviewed year instead of guessing an embargo date', () => {
    expect(() => releaseForYear('2027')).toThrow(/No reviewed location-release schedule/)
  })
})
