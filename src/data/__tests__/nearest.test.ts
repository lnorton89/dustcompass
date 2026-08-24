import { describe, expect, it } from 'vitest'
import { nearestOfCategory } from '../nearest'
import type { Poi } from '../types'

/**
 * #66: toilets are deliberately excluded from ordinary search results, but
 * the app never completed the thought with a "nearest" action — despite
 * already having precise survey coordinates and the shared GPS position.
 */

const poi = (uid: string, category: Poi['category'], position: [number, number]): Poi => ({
  uid,
  kind: 'service',
  name: uid,
  category,
  position,
  positionSource: 'gps',
  accuracyClass: 'surveyed',
})

describe('nearestOfCategory (#66)', () => {
  const origin: [number, number] = [-119.2, 40.78]

  it('picks the closest POI among several candidates of the same category', () => {
    const pois = [
      poi('far-toilet', 'toilet', [-119.21, 40.79]),
      poi('near-toilet', 'toilet', [-119.2001, 40.7801]),
      poi('medical', 'medical', [-119.2002, 40.7802]),
    ]
    expect(nearestOfCategory(pois, 'toilet', origin)?.uid).toBe('near-toilet')
  })

  it('ignores POIs of a different category even if closer', () => {
    const pois = [
      poi('close-ranger', 'ranger', [-119.2001, 40.7801]),
      poi('far-toilet', 'toilet', [-119.25, 40.82]),
    ]
    expect(nearestOfCategory(pois, 'toilet', origin)?.uid).toBe('far-toilet')
  })

  it('returns undefined when no POI of that category exists', () => {
    const pois = [poi('ranger', 'ranger', [-119.2001, 40.7801])]
    expect(nearestOfCategory(pois, 'medical', origin)).toBeUndefined()
  })

  it('changes its answer as the origin moves', () => {
    const pois = [
      poi('a', 'toilet', [-119.2, 40.79]),
      poi('b', 'toilet', [-119.2, 40.77]),
    ]
    expect(nearestOfCategory(pois, 'toilet', [-119.2, 40.789])?.uid).toBe('a')
    expect(nearestOfCategory(pois, 'toilet', [-119.2, 40.771])?.uid).toBe('b')
  })
})
