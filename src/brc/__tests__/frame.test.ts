import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CityLayout } from '../layout'
import { buildCity } from '../city'
import { cityOutlinePoints, frameFor } from '../frame'
import { destination, distanceBetween, type Position } from '../geo'

const layout = JSON.parse(readFileSync('public/data/2025/layout.json', 'utf8')) as CityLayout
const city = buildCity(layout)
const points = cityOutlinePoints(city.streets)
const man = layout.center.geometry.coordinates as Position

const PHONE = { width: 412, height: 780, padding: 24 }
const DESKTOP = { width: 1440, height: 800, padding: 24 }

/** Metres per pixel implied by a zoom level at a given latitude. */
const resolution = (zoom: number, lat: number) =>
  (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom

describe('framing the city', () => {
  it('returns nothing for no points', () => {
    expect(frameFor([], man, 45, PHONE)).toBeUndefined()
  })

  it('fills the viewport rather than leaving the city floating', () => {
    const frame = frameFor(points, man, layout.bearing, PHONE)!
    const mpp = resolution(frame.zoom, frame.center[1])

    // Project the city onto the screen and check how much of it is used.
    let maxAcross = 0
    for (const point of points) {
      maxAcross = Math.max(maxAcross, distanceBetween(frame.center, point))
    }
    const usedPixels = (maxAcross * 2) / mpp
    const shorterSide = Math.min(PHONE.width, PHONE.height) - PHONE.padding * 2

    // The city should span most of the shorter axis, not a third of it.
    expect(usedPixels).toBeGreaterThan(shorterSide * 0.9)
  })

  it('keeps every point inside the viewport', () => {
    for (const [bearing, viewport] of [
      [layout.bearing, PHONE],
      [layout.bearing, DESKTOP],
      [0, PHONE],
      [123, DESKTOP],
    ] as const) {
      const frame = frameFor(points, man, bearing, viewport)!
      const mpp = resolution(frame.zoom, frame.center[1])

      for (const point of points) {
        const distance = distanceBetween(frame.center, point)
        const angle =
          ((bearingFrom(frame.center, point) - bearing) * Math.PI) / 180
        const x = Math.abs((distance * Math.sin(angle)) / mpp)
        const y = Math.abs((distance * Math.cos(angle)) / mpp)
        expect(x).toBeLessThanOrEqual(viewport.width / 2 + 0.5)
        expect(y).toBeLessThanOrEqual(viewport.height / 2 + 0.5)
      }
    }
  })

  it('zooms in further on a bigger screen', () => {
    const phone = frameFor(points, man, layout.bearing, PHONE)!
    const desktop = frameFor(points, man, layout.bearing, DESKTOP)!
    expect(desktop.zoom).toBeGreaterThan(phone.zoom)
  })

  /**
   * The point of measuring along the screen's axes: the fit follows the
   * rotation. Four points at compass 45/135/225/315 sit on an axis-aligned
   * square, so a north-up camera frames them tightly and a 45° camera sees
   * them as a diamond and has to pull back.
   */
  it('tracks the rotation instead of the latitude/longitude box', () => {
    const square: Position[] = [45, 135, 225, 315].map((b) => destination(man, 1000, b))
    const upright = frameFor(square, man, 0, DESKTOP)!
    const rotated = frameFor(square, man, 45, DESKTOP)!

    expect(upright.zoom).toBeGreaterThan(rotated.zoom)
    // Precisely the √2 the diagonal costs, i.e. half a zoom level.
    expect(upright.zoom - rotated.zoom).toBeCloseTo(0.5, 2)
  })
})

function bearingFrom(from: Position, to: Position): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const deg = (r: number) => (r * 180) / Math.PI
  const [p1, p2] = [rad(from[1]), rad(to[1])]
  const dl = rad(to[0] - from[0])
  return (
    (deg(
      Math.atan2(
        Math.sin(dl) * Math.cos(p2),
        Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl),
      ),
    ) +
      360) %
    360
  )
}
