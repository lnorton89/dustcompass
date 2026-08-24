import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { RELEASES, releaseForYear } from '../../../scripts/lib/api.mjs'
import { BRC_2025, BRC_2026, embargoWindowForYear } from '../embargo'
import { DATA_YEAR } from '../../config'

/**
 * The embargo is a licence condition, and it is enforced in two places that do
 * not know about each other: `scripts/lib/api.mjs` decides what reaches disk,
 * `src/data/embargo.ts` decides what reaches the screen. Everything downstream
 * — the map, the share pages, the rendered cards — trusts one or the other.
 *
 * These are the two assertions that cannot be satisfied by accident.
 */
describe('the two halves of the embargo agree', () => {
  it('publishes and displays against the same dates', () => {
    for (const year of Object.keys(RELEASES)) {
      const writer = releaseForYear(year)
      const reader = embargoWindowForYear(year)
      expect(writer.camp.getTime(), `${year} camp release`).toBe(reader.campRelease.getTime())
      expect(writer.art.getTime(), `${year} art release`).toBe(reader.gatesOpen.getTime())
    }
  })

  it('has a reviewed schedule for every year it will publish', () => {
    // Both sides throw rather than guess for an unconfigured year, which is the
    // right behaviour for a licence condition — this only checks they are
    // configured in step, so one cannot quietly get ahead of the other.
    expect(Object.keys(RELEASES).sort()).toEqual(['2025', '2026'])
    expect(embargoWindowForYear('2025')).toBe(BRC_2025)
    expect(embargoWindowForYear('2026')).toBe(BRC_2026)
  })
})

const base = `public/data/${DATA_YEAR}`
const load = (name: string): { location_string?: string; location?: unknown }[] =>
  existsSync(`${base}/${name}`)
    ? (JSON.parse(readFileSync(`${base}/${name}`, 'utf8')) as { location_string?: string }[])
    : []

describe('what is on disk, about to be published', () => {
  const release = releaseForYear(DATA_YEAR)

  /**
   * The output invariant, rather than the behaviour of any one function: if the
   * embargo is live, the file the build is about to ship carries no locations.
   * Whichever path put them there — the API fetcher, the archive fetcher, a
   * hand-run command — this is where it is caught, and it now runs on the
   * deploy that publishes rather than only on the one that does not.
   */
  it.runIf(load('art.json').length > 0)('withholds art locations until Gates open', () => {
    if (new Date() >= release.art) return
    const leaked = load('art.json').filter((r) => r.location_string || r.location)
    expect(leaked).toEqual([])
  })

  it.runIf(load('camp.json').length > 0)('withholds camp locations until they are released', () => {
    if (new Date() >= release.camp) return
    const leaked = load('camp.json').filter((r) => r.location_string || r.location)
    expect(leaked).toEqual([])
  })
})
