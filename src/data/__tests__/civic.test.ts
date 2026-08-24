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

  it('says what a service is for, since the survey only gives it a name', () => {
    const rangers = pois.filter((poi) => poi.category === 'ranger')
    const toilets = pois.filter((poi) => poi.category === 'toilet')
    expect(rangers.every((poi) => poi.description?.includes('Rangers'))).toBe(true)
    expect(toilets.every((poi) => poi.description?.includes('MOOP'))).toBe(true)
    // Nothing invented for the ones whose own name is the whole story.
    const civic = pois.filter((poi) => poi.category === 'civic')
    expect(civic.length).toBeGreaterThan(0)
    expect(civic.every((poi) => poi.description === undefined)).toBe(true)
  })

  it('leaves the Man without an address, being what addresses are measured from', () => {
    const man = pois.find((poi) => poi.name === 'The Man')
    expect(man?.kind).toBe('landmark')
    expect(man?.address).toBeUndefined()
    expect(man?.position).toEqual(layout.center.geometry.coordinates)
    expect(man?.description).toMatch(/measured from here/)
  })

  it('reaches the portals too, and makes nothing up about them', () => {
    const portals = pois.filter((poi) => poi.kind === 'landmark' && poi.name !== 'The Man')
    expect(portals.length).toBe(layout.portals.length)
    expect(portals.every((poi) => poi.address)).toBe(true)
    // All this repo knows about a portal is its name and where it is, and both
    // are already on screen above the description.
    expect(portals.every((poi) => poi.description === undefined)).toBe(true)
  })
})

it('has a published survey to check the civic places against', () => {
  expect(hasSurvey, `run \`npm run fetch-data -- ${DATA_YEAR}\` before the tests`).toBe(true)
})

/**
 * Issue #45: synthetic, so it runs without a fetched survey. `civicPois()`
 * keeps every survey place at `kind: 'service'` so filters/favorites treat
 * them as one group, but landmark/arrival/info categories are not services,
 * and the drawer's kind chip (tested separately in DetailDrawer.test.tsx)
 * now reads that classification instead. The subtitle should not repeat it.
 */
describe('civicPois — landmark/arrival/info subtitles (#45)', () => {
  const layout: CityLayout = {
    center: {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [-119.2032, 40.7864] },
    },
    bearing: 45,
    fence_distance: 10000,
    road_width: 40,
    cStreets: [],
    tStreets: [],
    plazas: [],
    portals: [],
  }
  const empty: GeoJSON.FeatureCollection<GeoJSON.Point> = { type: 'FeatureCollection', features: [] }

  // Representative current-2026 CPNS entries from #45 itself.
  const services = buildServices({
    features: [
      { properties: { NAME: 'The Temple' }, geometry: { type: 'Point', coordinates: [-119.2, 40.79] } },
      { properties: { NAME: 'Gate Actual' }, geometry: { type: 'Point', coordinates: [-119.21, 40.79] } },
      { properties: { NAME: 'Yellow Bike Project' }, geometry: { type: 'Point', coordinates: [-119.22, 40.79] } },
      { properties: { NAME: 'Rampart' }, geometry: { type: 'Point', coordinates: [-119.23, 40.79] } },
    ],
  })
  const pois = civicPois(layout, services, empty, empty)
  const poiNamed = (name: string) => pois.find((poi) => poi.name === name)

  it('does not repeat the category as a subtitle for landmark/arrival/info places', () => {
    expect(poiNamed('The Temple')?.category).toBe('landmark')
    expect(poiNamed('The Temple')?.subtitle).toBeUndefined()
    expect(poiNamed('Gate Actual')?.category).toBe('arrival')
    expect(poiNamed('Gate Actual')?.subtitle).toBeUndefined()
    expect(poiNamed('Yellow Bike Project')?.category).toBe('info')
    expect(poiNamed('Yellow Bike Project')?.subtitle).toBeUndefined()
  })

  it('still gives a genuine service (medical) its subtitle', () => {
    expect(poiNamed('Rampart')?.category).toBe('medical')
    expect(poiNamed('Rampart')?.subtitle).toBe('Medical')
  })
})
