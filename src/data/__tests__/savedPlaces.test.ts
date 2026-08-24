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

  /**
   * The type guard used to check `typeof === 'number' && isFinite` on the
   * coordinates and stop there — it never checked the values were actually on
   * Earth, or that the rest of the record was intact. Out-of-range or
   * malformed records have to be dropped individually, without taking any
   * valid sibling record down with them.
   */
  it('drops records with out-of-range or non-finite coordinates', () => {
    const stored = JSON.stringify([
      valid,
      { ...valid, id: 'lat-too-high', position: [-119.2, 999] },
      { ...valid, id: 'huge-finite', position: [1e308, 40] },
      { ...valid, id: 'lon-too-high', position: [200, 40] },
      { ...valid, id: 'lon-too-low', position: [-200, 40] },
      { ...valid, id: 'lat-too-low', position: [-119.2, -999] },
      { ...valid, id: 'pos-infinity', position: [Infinity, 40] },
      { ...valid, id: 'neg-infinity', position: [-119.2, -Infinity] },
      { ...valid, id: 'nan-lon', position: [Number.NaN, 40] },
    ])
    expect(parsePlaces(stored).map((p) => p.id)).toEqual(['abc'])
  })

  it('drops records with a missing or wrong-type address or savedAt', () => {
    const { address: _address, ...noAddress } = valid
    const { savedAt: _savedAt, ...noSavedAt } = valid
    const stored = JSON.stringify([
      valid,
      { ...noAddress, id: 'no-address' },
      { ...valid, id: 'bad-address', address: 42 },
      { ...noSavedAt, id: 'no-saved-at' },
      { ...valid, id: 'bad-saved-at', savedAt: 'yesterday' },
      { ...valid, id: 'nan-saved-at', savedAt: Number.NaN },
      { ...valid, id: 'infinite-saved-at', savedAt: Infinity },
    ])
    expect(parsePlaces(stored).map((p) => p.id)).toEqual(['abc'])
  })

  it('drops records with an empty id or name', () => {
    const stored = JSON.stringify([
      valid,
      { ...valid, id: '' },
      { ...valid, id: '   ' },
      { ...valid, id: 'empty-name', name: '' },
      { ...valid, id: 'blank-name', name: '   ' },
    ])
    expect(parsePlaces(stored).map((p) => p.id)).toEqual(['abc'])
  })

  /**
   * Duplicate ids are a realistic corruption path — e.g. two tabs writing at
   * once — and they cannot both reach the caller, since ids get used as
   * React/GeoJSON feature keys. The first entry wins deterministically.
   */
  it('de-duplicates repeated ids, keeping the first', () => {
    const stored = JSON.stringify([
      { ...valid, name: 'First write' },
      { ...valid, name: 'Second write' },
    ])
    const result = parsePlaces(stored)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('First write')
  })
})
