/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSavedPlaces, type SavedPlace } from '../useSavedPlaces'

/**
 * Deleting a saved spot is the one destructive thing this app lets you do, and
 * the thing being deleted is where your tent is. The undo behind it has to be
 * exact: it puts the same spot back, and pressing it twice does not leave two.
 */
describe('losing and recovering a saved spot', () => {
  beforeEach(() => localStorage.clear())

  const save = (
    result: { current: ReturnType<typeof useSavedPlaces> },
    name: string,
  ): SavedPlace => {
    let saved: SavedPlace | undefined
    act(() => {
      saved = result.current.save(name, [-119.2, 40.78], 'D & 3:15')
    })
    if (!saved) throw new Error('save did not return the place it created')
    return saved
  }

  it('takes a spot back out again', () => {
    const { result } = renderHook(() => useSavedPlaces())
    const place = save(result, 'My tent')
    expect(result.current.places).toHaveLength(1)

    act(() => result.current.remove(place.id))
    expect(result.current.places).toEqual([])
  })

  it('puts back exactly what was removed', () => {
    const { result } = renderHook(() => useSavedPlaces())
    const place = save(result, 'My bike')
    act(() => result.current.remove(place.id))
    act(() => result.current.restore(place))

    expect(result.current.places).toHaveLength(1)
    expect(result.current.places[0]).toEqual(place)
  })

  it('does not leave two of it when undo happens twice', () => {
    const { result } = renderHook(() => useSavedPlaces())
    const place = save(result, 'Meeting point')
    act(() => result.current.remove(place.id))
    act(() => result.current.restore(place))
    act(() => result.current.restore(place))

    expect(result.current.places).toHaveLength(1)
  })
})

/**
 * Storage is keyed by DATA_YEAR, so each test here re-imports the hook after
 * mocking config for a given year — the key is baked in at module load, the
 * same way it would be baked into a real per-year build.
 */
describe('scoping saved spots to the data year', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it('does not carry a prior-year saved spot into a different DATA_YEAR build', async () => {
    vi.doMock('../../config', () => ({ DATA_YEAR: '2025' }))
    const { useSavedPlaces: useSavedPlaces2025 } = await import('../useSavedPlaces')
    const { result: result2025 } = renderHook(() => useSavedPlaces2025())
    act(() => {
      result2025.current.save('Old camp', [-119.2, 40.78], 'D & 3:15')
    })
    expect(result2025.current.places).toHaveLength(1)

    vi.resetModules()
    vi.doMock('../../config', () => ({ DATA_YEAR: '2026' }))
    const { useSavedPlaces: useSavedPlaces2026 } = await import('../useSavedPlaces')
    const { result: result2026 } = renderHook(() => useSavedPlaces2026())

    expect(result2026.current.places).toEqual([])
  })

  it('persists a current-year save across a reload', async () => {
    vi.doMock('../../config', () => ({ DATA_YEAR: '2026' }))
    const { useSavedPlaces: useSavedPlacesBeforeReload } = await import('../useSavedPlaces')
    const { result: before } = renderHook(() => useSavedPlacesBeforeReload())
    act(() => {
      before.current.save('My tent', [-119.2, 40.78], 'D & 3:15')
    })

    vi.resetModules()
    vi.doMock('../../config', () => ({ DATA_YEAR: '2026' }))
    const { useSavedPlaces: useSavedPlacesAfterReload } = await import('../useSavedPlaces')
    const { result: after } = renderHook(() => useSavedPlacesAfterReload())

    expect(after.current.places).toHaveLength(1)
    expect(after.current.places[0].name).toBe('My tent')
  })

  it('migrates unversioned legacy storage instead of showing it as current', async () => {
    localStorage.setItem(
      'playa-map.places.v1',
      JSON.stringify([
        { id: 'old', name: 'Legacy spot', position: [-119.2, 40.78], address: 'D & 3:15', savedAt: 1 },
      ]),
    )

    vi.doMock('../../config', () => ({ DATA_YEAR: '2026' }))
    const { useSavedPlaces: useSavedPlaces2026 } = await import('../useSavedPlaces')
    const { result } = renderHook(() => useSavedPlaces2026())

    expect(result.current.places).toEqual([])
    expect(localStorage.getItem('playa-map.places.v1')).toBeNull()
    expect(localStorage.getItem('playa-map.places.v1.legacy-unversioned')).not.toBeNull()
  })
})
