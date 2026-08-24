import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CityLayout } from '../layout'
import { distanceBetween, minutesToClock, type Position } from '../geo'
import { geocode, parseAddress } from '../geocode'
import { DATA_YEAR } from '../../config'

const layout = JSON.parse(
  readFileSync(`public/data/${DATA_YEAR}/layout.json`, 'utf8'),
) as CityLayout

/**
 * Both the search box and the `?at=` parameter of a shared link call straight
 * into the parser on whatever text they are given. Anything it cannot read has
 * to come back as "no match" — throwing takes the render down with it, and a
 * link is something a stranger can hand you.
 */
describe('addresses that are not addresses', () => {
  const nonsense = [
    'D & 2:60',
    '2:60 & D',
    'E and 5:75',
    'G & 0:99',
    '7:60 Portal & A',
    'D & 99:99',
    '::::',
    '   ',
    '3:',
    'Esplanade &',
  ]

  it('answers nothing rather than throwing', () => {
    for (const input of nonsense) {
      expect(() => parseAddress(input, layout), input).not.toThrow()
      expect(() => geocode(input, layout), input).not.toThrow()
    }
  })

  it('still reads the forms that are real', () => {
    for (const input of ['D & 3:15', '3:15 & D', '7:30 & Esplanade', "12:00 2500', Open Playa"]) {
      expect(parseAddress(input, layout), input).toBeDefined()
    }
  })
})

describe('an address that names two clocks', () => {
  /**
   * "10:00 & 10:00 B Plaza" is a plaza, and the second clock's hour used to be
   * read as a distance in feet — pinning it ten feet from the Man rather than
   * on a plaza a kilometre away.
   */
  it('lands on the plaza, not ten feet from the Man', () => {
    const centre = layout.center.geometry.coordinates as Position
    for (const input of ['10:00 & 10:00 B Plaza', '2:00 & 2:00 B Plaza']) {
      const hit = geocode(input, layout)
      expect(hit, input).toBeDefined()
      // B street is about a kilometre out. Ask where it actually put the pin —
      // `distanceFeet` on a plaza address is the rim radius, not the distance
      // from the Man, which is its own trap.
      const metres = distanceBetween(centre, hit!.position)
      expect(metres, `${input} landed ${metres.toFixed(0)}m from the Man`).toBeGreaterThan(800)
    }
  })
})

describe('clock formatting', () => {
  it('never emits a sixtieth minute', () => {
    const bad: string[] = []
    for (let m = 0; m < 720; m += 0.05) {
      const clock = minutesToClock(m)
      const [, minute] = clock.split(':')
      if (Number(minute) > 59) bad.push(`${m.toFixed(2)} -> ${clock}`)
    }
    expect(bad.slice(0, 5)).toEqual([])
  })

  it('rolls the hour over instead', () => {
    expect(minutesToClock(59.7)).toBe('1:00')
    expect(minutesToClock(719.9)).toBe('12:00')
  })
})
