/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
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
