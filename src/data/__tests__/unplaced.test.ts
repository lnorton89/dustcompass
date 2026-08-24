import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CityLayout } from '../../brc/layout'
import { DATA_YEAR } from '../../config'
import { applyEmbargo } from '../embargo'
import type { ArtItem, CampItem } from '../types'
import { toPois } from '../usePlayaData'

/**
 * Before Gates, every art location in the catalogue is withheld — so for the
 * week when people are actually planning, all 300-odd pieces used to be
 * dropped on the floor and the app behaved as though it had never heard of
 * them. The listing is not the embargoed part. The location is, and it is
 * already gone by the time any of this runs.
 */
const base = `public/data/${DATA_YEAR}`
const hasListings = existsSync(`${base}/layout.json`) && existsSync(`${base}/art.json`)
const read = <T>(name: string) => JSON.parse(readFileSync(`${base}/${name}`, 'utf8')) as T

describe.runIf(hasListings)(`${DATA_YEAR} listings that cannot be placed`, () => {
  const layout = read<CityLayout>('layout.json')
  const rawArt = read<ArtItem[]>('art.json')
  const rawCamps = read<CampItem[]>('camp.json')

  it('keeps embargoed art reachable by name, with nothing of where it is', () => {
    const art = applyEmbargo(rawArt, false)
    const { pois, unplaced } = toPois(layout, art, [], {
      artReleased: false,
      campsReleased: true,
    })

    // Nothing on the map, everything in the catalogue.
    expect(pois).toHaveLength(0)
    expect(unplaced).toHaveLength(rawArt.length)
    expect(unplaced.every((listing) => listing.reason === 'embargoed')).toBe(true)
    expect(unplaced.every((listing) => listing.name)).toBe(true)

    /*
     * The part that matters, and it is a structural claim rather than a
     * textual one: an unplaced listing has no field that could carry a
     * position, so there is nothing for the map or a share card to read out of
     * it. Not a search for the word "location" — four of these pieces say it
     * in their own descriptions, which is the listing talking, not a leak.
     */
    const allowed = ['description', 'kind', 'name', 'reason', 'subtitle', 'thumbnail', 'uid']
    for (const listing of unplaced) {
      for (const key of Object.keys(listing)) expect(allowed).toContain(key)
    }
  })

  it('places art once its locations are released', () => {
    const { pois, unplaced } = toPois(layout, rawArt, [], {
      artReleased: true,
      campsReleased: true,
    })
    // The fixture on disk is already redacted, so nothing can be placed from
    // it. What this pins is the reason: released and absent is not embargoed.
    expect(pois.length + unplaced.length).toBe(rawArt.length)
    expect(unplaced.every((listing) => listing.reason === 'unpublished')).toBe(true)
  })

  it('leaves the placed camps on the map and only strands the locationless', () => {
    const { pois, unplaced } = toPois(layout, [], rawCamps, {
      artReleased: false,
      campsReleased: true,
    })
    expect(pois.length).toBeGreaterThan(1000)
    expect(pois.length + unplaced.length).toBe(rawCamps.length)
    expect(unplaced.every((listing) => listing.kind === 'camp')).toBe(true)
  })
})
