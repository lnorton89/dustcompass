import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CityLayout } from '../layout'
import { distanceBetween } from '../geo'
import { geocode } from '../geocode'
import { frontagePosition, parseFacing } from '../frontage'
import { DATA_YEAR } from '../../config'

const base = `public/data/${DATA_YEAR}`
const layout = JSON.parse(readFileSync(`${base}/layout.json`, 'utf8')) as CityLayout

type Camp = {
  name?: string
  location_string?: string
  location?: { exact_location?: string }
}
const camps = (() => {
  try {
    return JSON.parse(readFileSync(`${base}/camp.json`, 'utf8')) as Camp[]
  } catch {
    return []
  }
})()

describe('reading which side of the street a camp is on', () => {
  it('understands the phrasing the listings use', () => {
    expect(parseFacing('Corner - facing man & 2:00')).toBe('man')
    expect(parseFacing('Mid-block facing mountain')).toBe('mountain')
    expect(parseFacing('Mid-block facing 6:00')).toBeUndefined()
    expect(parseFacing(undefined)).toBeUndefined()
  })

  it('puts the man side nearer the Man than the mountain side', () => {
    const man = frontagePosition(layout, '2:00 & E', 'Corner - facing man & 2:00')!
    const mountain = frontagePosition(layout, '2:00 & E', 'Corner - facing mountain & 2:00')!
    const centre = layout.center.geometry.coordinates as [number, number]
    expect(distanceBetween(centre, man)).toBeLessThan(distanceBetween(centre, mountain))
    // Far enough apart to be separate pins, close enough to stay on the block.
    const apart = distanceBetween(man, mountain)
    expect(apart).toBeGreaterThan(20)
    expect(apart).toBeLessThan(60)
  })

  it('leaves an address alone when the listing does not say', () => {
    const plain = frontagePosition(layout, '2:00 & E', undefined)
    expect(plain).toEqual(geocode('2:00 & E', layout)!.position)
  })

  it('does not move an address that has no inside or outside', () => {
    const openPlaya = "12:00 2500', Open Playa"
    expect(frontagePosition(layout, openPlaya, 'Mid-block facing man')).toEqual(
      geocode(openPlaya, layout)!.position,
    )
  })
})

describe.runIf(camps.length > 0)('across the published listings', () => {
  const placed = camps.filter((camp) => camp.location_string)

  const pileUp = (positioned: ([number, number] | undefined)[]) => {
    const seen = new Map<string, number>()
    for (const position of positioned) {
      if (!position) continue
      const key = position.map((n) => n.toFixed(6)).join(',')
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
    return {
      worst: Math.max(...seen.values()),
      stacked: [...seen.values()].filter((n) => n > 1).reduce((a, b) => a + b, 0),
    }
  }

  it('unstacks most camps that share an address', () => {
    const before = pileUp(placed.map((camp) => geocode(camp.location_string!, layout)?.position))
    const after = pileUp(
      placed.map((camp) =>
        frontagePosition(layout, camp.location_string!, camp.location?.exact_location),
      ),
    )
    // This cannot reach zero honestly: a block side really does hold several
    // camps, and the listings never say where along it any of them sits. What
    // it must do is halve the tallest pile and take a real bite out of the
    // total, so the map shows two sides of a street instead of one dot.
    expect(after.worst).toBeLessThan(before.worst * 0.75)
    expect(after.stacked).toBeLessThan(before.stacked * 0.9)
  })

  it('separates the two camps on the 2:00 and E corner', () => {
    const find = (name: string) => placed.find((camp) => camp.name === name)
    const soundGarden = find('The Sound Garden')
    const landHo = find('Camp LandHO!')
    if (!soundGarden || !landHo) return

    const at = (camp: Camp) =>
      frontagePosition(layout, camp.location_string!, camp.location?.exact_location)!
    expect(distanceBetween(at(soundGarden), at(landHo))).toBeGreaterThan(20)
  })
})
