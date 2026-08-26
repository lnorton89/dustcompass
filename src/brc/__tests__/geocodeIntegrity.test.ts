import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CityLayout } from '../layout'
import { distanceBetween } from '../geo'
import { geocode, parseAddress } from '../geocode'
import { DATA_YEAR } from '../../config'

const layout = JSON.parse(
  readFileSync(`public/data/${DATA_YEAR}/layout.json`, 'utf8'),
) as CityLayout

describe('geocoder trust boundaries (#156-#158)', () => {
  it('keeps plaza-plus-street syntax at the named plaza centre (#156)', () => {
    const plazas = layout.plazas.filter((plaza) => typeof plaza.distance === 'string').slice(0, 3)
    expect(plazas.length).toBeGreaterThan(0)

    for (const plaza of plazas) {
      const centre = geocode(plaza.name, layout)
      const withStreet = geocode(`${plaza.name} & ${plaza.distance}`, layout)
      const rim = geocode(`${plaza.name} @ 4:45`, layout)

      expect(centre).toBeDefined()
      expect(withStreet).toBeDefined()
      expect(withStreet?.label).toBe(centre?.label)
      expect(distanceBetween(withStreet!.position, centre!.position)).toBeLessThan(0.01)

      // Explicit plaza-rim syntax retains its distinct meaning.
      expect(rim).toBeDefined()
      expect(distanceBetween(rim!.position, centre!.position)).toBeGreaterThan(1)
    }
  })

  it('bounds open-playa distances by the annual surveyed fence (#157)', () => {
    expect(geocode(`6:00 ${layout.fence_distance}'`, layout)).toBeDefined()
    expect(geocode(`6:00 ${layout.fence_distance + 1}'`, layout)).toBeUndefined()
    expect(geocode("6:00 99999'", layout)).toBeUndefined()
    expect(geocode("6:00 0'", layout)).toBeUndefined()
    expect(geocode("12:00 2500'", layout)).toBeDefined()
  })

  it('rejects extra or contradictory clock/street components (#158)', () => {
    expect(parseAddress('7:30 & Esplanade', layout)).toBeDefined()
    expect(parseAddress('Esplanade & 7:30', layout)).toBeDefined()
    expect(parseAddress('7:30 & Esplanade & 9:00', layout)).toBeUndefined()
    expect(parseAddress('7:30 & Esplanade & B', layout)).toBeUndefined()
    expect(parseAddress('7:30 & 9:00', layout)).toBeUndefined()
  })
})
