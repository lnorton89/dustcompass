import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { applyEmbargo, BRC_2026, embargoState } from '../embargo'
import { geocode } from '../../brc/geocode'
import type { CityLayout } from '../../brc/layout'
import type { ArtItem } from '../types'

import { DATA_YEAR } from '../../config'

const base = `public/data/${DATA_YEAR}`
const layout = JSON.parse(readFileSync(`${base}/layout.json`, 'utf8')) as CityLayout
const art = JSON.parse(readFileSync(`${base}/art.json`, 'utf8')) as ArtItem[]

describe('embargo windows', () => {
  it('withholds both before the camp release', () => {
    const state = embargoState(BRC_2026, new Date('2026-08-01T12:00:00-07:00'))
    expect(state).toEqual({ campsReleased: false, artReleased: false })
  })

  it('releases camps a week before gates, art only at gates', () => {
    const sunday = embargoState(BRC_2026, new Date('2026-08-24T12:00:00-07:00'))
    expect(sunday).toEqual({ campsReleased: true, artReleased: false })

    const gates = embargoState(BRC_2026, new Date('2026-08-30T00:02:00-07:00'))
    expect(gates).toEqual({ campsReleased: true, artReleased: true })
  })
})

describe('applying the embargo', () => {
  it('is a no-op once released', () => {
    expect(applyEmbargo(art, true)).toBe(art)
  })

  it('keeps the listing but removes the position', () => {
    const gated = applyEmbargo(art, false)
    expect(gated).toHaveLength(art.length)
    expect(gated.every((item) => item.name)).toBe(true)
    expect(gated.some((item) => item.location?.gps_latitude != null)).toBe(false)
  })

  /**
   * The regression this exists for: stripping GPS alone is not enough, because
   * the address string geocodes back to within a metre of the position the
   * embargo is meant to withhold.
   */
  it('removes the address too, so the position cannot be recovered', () => {
    const gated = applyEmbargo(art, false)
    const recoverable = gated.filter(
      (item) => item.location_string && geocode(item.location_string, layout),
    )
    expect(recoverable).toEqual([])
  })

  it('leaves nothing behind that the map could plot', () => {
    for (const item of applyEmbargo(art, false)) {
      expect(item.location).toBeUndefined()
      expect(item.location_string).toBeUndefined()
    }
  })
})
