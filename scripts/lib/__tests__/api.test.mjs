import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  embargoNote,
  redactEmbargoedLocations,
  RELEASE_2026,
  releaseForYear,
  summarize,
  validateDataset,
} from '../api.mjs'

/**
 * The 2025 listings in public/data came from this same API, so they are a real
 * fixture for what a good response looks like — not a hand-written guess at it.
 */
const load = (name) => JSON.parse(readFileSync(`public/data/2025/${name}.json`, 'utf8'))

describe('validating a real response', () => {
  it('accepts the shapes the app is built against', () => {
    for (const kind of ['art', 'camp', 'event']) {
      expect(validateDataset(kind, load(kind)).problems).toEqual([])
    }
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
