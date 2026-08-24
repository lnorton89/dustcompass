import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { toPois } from '../usePlayaData'
import { DATA_YEAR } from '../../config'
import type { CityLayout } from '../../brc/layout'
import type { ArtItem, CampItem } from '../types'

const dir = `public/data/${DATA_YEAR}`
const have = ['layout.json', 'art.json'].every((n) => existsSync(`${dir}/${n}`))
const read = (name: string) => JSON.parse(readFileSync(`${dir}/${name}`, 'utf8'))

/**
 * Gates open on the clock. The locations arrive over the network, and the
 * people this app exists for are the ones without it — so for most of them the
 * two do not happen together, and a phone cached before Gates holds art with
 * every location stripped out.
 *
 * That copy used to say "no location published" about all 329 pieces the moment
 * the embargo lifted, which is the opposite of what had happened. Nobody can
 * fix this from playa, so it is pinned here rather than found there.
 */
describe.skipIf(!have)('when Gates open before the data catches up', () => {
  const layout = read('layout.json') as CityLayout
  const art = read('art.json') as ArtItem[]
  const camps = (existsSync(`${dir}/camp.json`) ? read('camp.json') : []) as CampItem[]
  const run = (artReleased: boolean) =>
    toPois(layout, art, camps, { campsReleased: true, artReleased } as never)

  it('calls a pre-Gates copy stale, not unpublished', () => {
    const placed = art.filter((item) => item.location_string).length
    // Only meaningful while the shipped data is still embargoed; once a real
    // post-Gates fetch lands, art has locations and there is nothing to detect.
    if (placed > 0) return
    const after = run(true).unplaced.filter((listing) => listing.kind === 'art')
    expect(after.length).toBeGreaterThan(20)
    expect([...new Set(after.map((listing) => listing.reason))]).toEqual(['stale'])
  })

  it('still calls it embargoed before Gates', () => {
    const before = run(false).unplaced.filter((listing) => listing.kind === 'art')
    expect([...new Set(before.map((listing) => listing.reason))]).toEqual(['embargoed'])
  })

  it('does not cry stale over a catalogue that is genuinely small', () => {
    const few = art.slice(0, 3).map((item) => ({ ...item, location_string: undefined }))
    const { unplaced } = toPois(layout, few, [], {
      campsReleased: true,
      artReleased: true,
    } as never)
    expect([...new Set(unplaced.map((listing) => listing.reason))]).toEqual(['unpublished'])
  })

  it('says nothing at all once the locations have actually arrived', () => {
    const placed = art.slice(0, 40).map((item) => ({ ...item, location_string: '3:00 & E' }))
    const { pois, unplaced } = toPois(layout, placed, [], {
      campsReleased: true,
      artReleased: true,
    } as never)
    expect(pois.filter((poi) => poi.kind === 'art').length).toBeGreaterThan(0)
    expect(unplaced.filter((listing) => listing.reason === 'stale')).toEqual([])
  })
})
