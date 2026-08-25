import { describe, expect, it, vi } from 'vitest'
import { handleMapMarkerClick } from '../markerClick'

describe('map marker click isolation', () => {
  it('stops the map click before reopening the marker actions', () => {
    const stopPropagation = vi.fn()
    const reopen = vi.fn()

    handleMapMarkerClick({ stopPropagation }, reopen)

    expect(stopPropagation).toHaveBeenCalledTimes(1)
    expect(reopen).toHaveBeenCalledTimes(1)
    expect(stopPropagation.mock.invocationCallOrder[0]).toBeLessThan(reopen.mock.invocationCallOrder[0])
  })
})
