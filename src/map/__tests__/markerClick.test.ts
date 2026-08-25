import { describe, expect, it, vi } from 'vitest'
import {
  handleMapMarkerClick,
  isDroppedMarkerHit,
  isInteractiveMapMarkerTarget,
} from '../markerClick'

describe('map marker click isolation', () => {
  it('stops the map click before reopening the marker actions', () => {
    const stopPropagation = vi.fn()
    const reopen = vi.fn()

    handleMapMarkerClick({ stopPropagation }, reopen)

    expect(stopPropagation).toHaveBeenCalledTimes(1)
    expect(reopen).toHaveBeenCalledTimes(1)
    expect(stopPropagation.mock.invocationCallOrder[0]).toBeLessThan(reopen.mock.invocationCallOrder[0])
  })

  it('identifies a child of an interactive marker from MapLibre\'s original target', () => {
    const child = Object.assign(new EventTarget(), { closest: vi.fn(() => ({ marker: true })) })
    const canvas = Object.assign(new EventTarget(), { closest: vi.fn(() => null) })

    expect(isInteractiveMapMarkerTarget(child)).toBe(true)
    expect(child.closest).toHaveBeenCalledWith('[data-map-marker-interactive="true"]')
    expect(isInteractiveMapMarkerTarget(canvas)).toBe(false)
    expect(isInteractiveMapMarkerTarget(null)).toBe(false)
  })

  it('recognizes the bottom-centred 44px marker box after canvas retargeting', () => {
    const anchor = { x: 100, y: 200 }

    expect(isDroppedMarkerHit({ x: 100, y: 178 }, anchor)).toBe(true)
    expect(isDroppedMarkerHit({ x: 78, y: 156 }, anchor)).toBe(true)
    expect(isDroppedMarkerHit({ x: 77, y: 178 }, anchor)).toBe(false)
    expect(isDroppedMarkerHit({ x: 100, y: 201 }, anchor)).toBe(false)
  })
})
