import { describe, expect, it, vi } from 'vitest'
import {
  handleMapMarkerClick,
  isInteractiveMapMarkerTarget,
  shouldIgnoreMapClick,
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

  it('guards a canvas-retargeted map click immediately after marker pointer-down', () => {
    const canvas = Object.assign(new EventTarget(), { closest: vi.fn(() => null) })

    expect(shouldIgnoreMapClick(canvas, 10_000, 10_500)).toBe(true)
    expect(shouldIgnoreMapClick(canvas, 10_000, 11_001)).toBe(false)
  })
})
