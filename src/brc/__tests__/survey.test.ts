import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CityLayout } from '../layout'
import type { Position } from '../geo'
import { distanceBetween } from '../geo'
import { geocode } from '../geocode'
import { DATA_YEAR } from '../../config'

/**
 * `layout.json` is not copied from anywhere: `scripts/derive-layout.mjs` fits it
 * to the annular street centrelines in Burning Man's published survey. That
 * makes it checkable against the same survey's control points, which are
 * surveyed independently of the street lines the fit consumed.
 *
 * The whole map hangs off this arithmetic being right, and a layout that has
 * drifted is worse than no layout — it puts a confident pin in the wrong place.
 */
const base = `public/data/${DATA_YEAR}`
const hasSurvey = existsSync(`${base}/layout.json`) && existsSync(`${base}/cpns.geojson`)

const FEET_PER_METRE = 3.280839895
const PLAZA = /^(\d{1,4}) & ([A-Z]) Plaza$/

it('has a published survey to check the layout against', () => {
  // Not skipped when the data is missing: a run that quietly checks nothing is
  // how a layout regression reaches the playa.
  expect(hasSurvey, `run \`npm run fetch-data -- ${DATA_YEAR}\` before the tests`).toBe(true)
})

describe.runIf(hasSurvey)(`${DATA_YEAR} layout against the published survey`, () => {
  const layout = JSON.parse(readFileSync(`${base}/layout.json`, 'utf8')) as CityLayout
  const cpns = JSON.parse(readFileSync(`${base}/cpns.geojson`, 'utf8')) as GeoJSON.FeatureCollection

  const named = (pattern: RegExp) =>
    cpns.features
      .filter(
        (f) => typeof f.properties?.NAME === 'string' && pattern.test(f.properties.NAME),
      )
      .map((f) => ({
        name: f.properties!.NAME as string,
        at: (f.geometry as GeoJSON.Point).coordinates as Position,
      }))

  /** The survey writes clocks without a colon: "3" is 3:00, "430" is 4:30. */
  const clockOf = (digits: string) =>
    digits.length <= 2 ? `${digits}:00` : `${digits.slice(0, -2)}:${digits.slice(-2)}`

  const man = layout.center.geometry.coordinates as Position
  const feetFromMan = (position: Position) => distanceBetween(man, position) * FEET_PER_METRE

  it('centres the city on the surveyed Man', () => {
    const [surveyed] = named(/^The Man$/)
    expect(surveyed).toBeDefined()
    expect(distanceBetween(man, surveyed.at)).toBeLessThan(1)
  })

  it('puts every surveyed plaza exactly on its annular street', () => {
    const plazas = named(PLAZA)
    expect(plazas.length).toBeGreaterThan(8)

    // Each street's radius is the number the circle fit produced, so this is
    // the direct check on it, against points the fit never saw.
    const offRing: string[] = []
    for (const plaza of plazas) {
      const ref = PLAZA.exec(plaza.name)![2].toLowerCase()
      const street = layout.cStreets.find((s) => s.ref === ref)
      if (!street) {
        offRing.push(`${plaza.name}: the layout has no ${ref.toUpperCase()} street`)
        continue
      }
      const drift = Math.abs(feetFromMan(plaza.at) - street.distance)
      if (drift > 1) offRing.push(`${plaza.name}: ${drift.toFixed(2)} ft off ${ref.toUpperCase()}`)
    }
    expect(offRing).toEqual([])
  })

  it('geocodes each plaza address into that plaza', () => {
    const misses: string[] = []
    for (const plaza of named(PLAZA)) {
      const [, digits, street] = PLAZA.exec(plaza.name)!
      const hit = geocode(`${clockOf(digits)} & ${street}`, layout)
      if (!hit) {
        misses.push(`${plaza.name}: did not geocode`)
        continue
      }
      // The survey marks a plaza centre to a metre or two of the exact
      // intersection, and deliberately pulls the two that end B street a few
      // clock-minutes inward. Landing inside the plaza is the claim that
      // matters to someone searching for one.
      const declared = layout.plazas.find(
        (p) => p.name === `${clockOf(digits)} & ${street} Plaza`,
      )
      const radius = (declared?.diameter ?? 200) / 2 / FEET_PER_METRE
      const off = distanceBetween(hit.position, plaza.at)
      if (off > radius) misses.push(`${plaza.name}: ${off.toFixed(1)} m outside a ${radius.toFixed(0)} m plaza`)
    }
    expect(misses).toEqual([])
  })

  it('carries every surveyed portal', () => {
    const portals = named(/^\d{1,4} Portal$/)
    expect(portals.length).toBeGreaterThan(2)
    for (const portal of portals) {
      expect(
        layout.portals.some((p) => p.name === portal.name),
        `${portal.name} is missing from the layout`,
      ).toBe(true)
    }
  })

  it('keeps the annular streets concentric and correctly ordered', () => {
    const radii = layout.cStreets.map((street) => street.distance)
    expect(radii).toEqual([...radii].sort((a, b) => a - b))
    expect(layout.cStreets[0].ref).toBe('esplanade')
    // Consecutive letters, no gaps, once past the Esplanade.
    const letters = layout.cStreets.slice(1).map((street) => street.ref)
    expect(letters).toEqual(letters.map((_, i) => String.fromCharCode(97 + i)))
  })

  it('describes a city the fence encloses', () => {
    const outermost = Math.max(...layout.cStreets.map((street) => street.distance))
    expect(layout.fence_distance).toBeGreaterThan(outermost)
  })
})
