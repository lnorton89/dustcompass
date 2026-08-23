import { describe, expect, it } from 'vitest'
import { parsePlaces } from '../useSavedPlaces'

const valid = {
  id: 'abc',
  name: 'My camp',
  position: [-119.2, 40.78],
  address: 'D & 3:15',
  savedAt: 1_700_000_000_000,
}

describe('recovering saved spots from storage', () => {
  it('reads back what was written', () => {
    expect(parsePlaces(JSON.stringify([valid]))).toEqual([valid])
  })

  it('treats nothing stored as no places', () => {
    expect(parsePlaces(null)).toEqual([])
    expect(parsePlaces('')).toEqual([])
  })

  /**
   * A truncated write is the realistic corruption here — the phone dies
   * mid-save. Losing the file is acceptable; crashing the map is not.
   */
  it('survives truncated or invalid JSON', () => {
    expect(parsePlaces('[{"id":"abc","name":"My ca')).toEqual([])
    expect(parsePlaces('not json at all')).toEqual([])
  })

  it('ignores a stored value that is not a list', () => {
    expect(parsePlaces('{"places":[]}')).toEqual([])
    expect(parsePlaces('42')).toEqual([])
  })

  it('keeps the good entries and drops only the broken ones', () => {
    const stored = JSON.stringify([
      valid,
      { id: 'no-name', position: [-119.2, 40.78] },
      { ...valid, id: 'bad-coords', position: [-119.2, Number.NaN] },
      { ...valid, id: 'short', position: [-119.2] },
      null,
      'a string',
      { ...valid, id: 'second' },
    ])
    expect(parsePlaces(stored).map((p) => p.id)).toEqual(['abc', 'second'])
  })
})
