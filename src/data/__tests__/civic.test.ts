import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildCity } from '../../brc/city'
import type { CityLayout } from '../../brc/layout'
import { buildServices, toiletPoints } from '../../brc/services'
import { DATA_YEAR } from '../../config'
import { civicPois } from '../civic'

/**
 * Rangers, medical, ice, toilets and the Man are drawn from the survey rather
 * than the listings API. Everything downstream of the map — the drawer, the
 * route, the shared link — keys off a uid, so without one they were on the
 * map but not reachable: taps fell through them onto the bare playa.
 */
const base = `public/data/${DATA_YEAR}`
const hasSurvey =
  existsSync(`${base}/layout.json`) &&
  existsSync(`${base}/cpns.geojson`) &&
  existsSync(`${base}/toilets.geojson`)

const read = (name: string) =>
  JSON.parse(readFileSync(`${base}/${name}`, 'utf8')) as GeoJSON.FeatureCollection

describe.runIf(hasSurvey)(`${DATA_YEAR} survey places as listings`, () => {
  const layout = JSON.parse(readFileSync(`${base}/layout.json`, 'utf8')) as CityLayout
  const pois = civicPois(
    layout,
    buildServices(read('cpns.geojson')),
    toiletPoints(read('toilets.geojson')),
    buildCity(layout).landmarks,
  )

  it('gives every place a uid of its own', () => {
    expect(pois.length).toBeGreaterThan(0)
    expect(new Set(pois.map((poi) => poi.uid)).size).toBe(pois.length)
    expect(pois.every((poi) => poi.uid.includes(':'))).toBe(true)
  })

  it('finds the rangers, and says that is what they are', () => {
    const rangers = pois.filter((poi) => poi.category === 'ranger')
    expect(rangers.length).toBeGreaterThan(0)
    for (const station of rangers) {
      expect(station.kind).toBe('service')
      expect(station.subtitle).toBe('Rangers')
      // Surveyed coordinates, so the pin is the station rather than the
      // intersection its address rounds to.
      expect(station.positionSource).toBe('gps')
      expect(station.address).toMatch(/\d/)
    }
  })

  it('carries the toilet banks, each one separately selectable', () => {
    const toilets = pois.filter((poi) => poi.category === 'toilet')
    expect(toilets.length).toBeGreaterThan(1)
    expect(new Set(toilets.map((poi) => poi.uid)).size).toBe(toilets.length)
    expect(toilets.every((poi) => poi.name === 'Toilets')).toBe(true)
  })

  it('leaves the Man without an address, being what addresses are measured from', () => {
    const man = pois.find((poi) => poi.name === 'The Man')
    expect(man?.kind).toBe('landmark')
    expect(man?.address).toBeUndefined()
    expect(man?.position).toEqual(layout.center.geometry.coordinates)
  })

  it('reaches the portals too', () => {
    const portals = pois.filter((poi) => poi.kind === 'landmark' && poi.name !== 'The Man')
    expect(portals.length).toBe(layout.portals.length)
    expect(portals.every((poi) => poi.address)).toBe(true)
  })
})

it('has a published survey to check the civic places against', () => {
  expect(hasSurvey, `run \`npm run fetch-data -- ${DATA_YEAR}\` before the tests`).toBe(true)
})
