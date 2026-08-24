/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SearchPanel, optionIcon } from '../SearchPanel'
import type { CityLayout } from '../../brc/layout'
import type { Poi, UnplacedListing } from '../../data/types'
import type { SavedPlace } from '../../data/useSavedPlaces'

afterEach(() => cleanup())

/**
 * Issue #43: every `kind: 'service'` search result used to render the same
 * hospital-cross icon, whether it was Rampart or The Temple. These pin
 * `optionIcon` down to category, not just kind.
 */
describe('SearchPanel optionIcon (issue #43)', () => {
  it('gives medical and ranger services the hospital icon', () => {
    render(optionIcon({ kind: 'service', category: 'medical' }))
    expect(screen.getByTestId('LocalHospitalIcon')).toBeTruthy()
    cleanup()

    render(optionIcon({ kind: 'service', category: 'ranger' }))
    expect(screen.getByTestId('LocalHospitalIcon')).toBeTruthy()
  })

  it('does not give a landmark (The Temple) the hospital icon', () => {
    render(optionIcon({ kind: 'service', category: 'landmark' }))
    expect(screen.queryByTestId('LocalHospitalIcon')).toBeNull()
    expect(screen.getByTestId('PlaceIcon')).toBeTruthy()
  })

  it('does not give arrival/transport places the hospital icon', () => {
    render(optionIcon({ kind: 'service', category: 'arrival' }))
    expect(screen.queryByTestId('LocalHospitalIcon')).toBeNull()
    expect(screen.getByTestId('PlaceIcon')).toBeTruthy()
  })

  it('does not give participant-info places the hospital icon', () => {
    render(optionIcon({ kind: 'service', category: 'info' }))
    expect(screen.queryByTestId('LocalHospitalIcon')).toBeNull()
    expect(screen.getByTestId('PlaceIcon')).toBeTruthy()
  })

  it('keeps the generic civic/unknown fallback non-medical too', () => {
    render(optionIcon({ kind: 'service', category: 'civic' }))
    expect(screen.queryByTestId('LocalHospitalIcon')).toBeNull()
    expect(screen.getByTestId('PlaceIcon')).toBeTruthy()
  })

  it('falls back to the neutral icon for a service with no category info', () => {
    render(optionIcon({ kind: 'service' }))
    expect(screen.queryByTestId('LocalHospitalIcon')).toBeNull()
    expect(screen.getByTestId('PlaceIcon')).toBeTruthy()
  })
})

const LAYOUT: CityLayout = {
  center: {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Point', coordinates: [-119.2, 40.78] },
  },
  bearing: 45,
  fence_distance: 10560,
  road_width: 40,
  cStreets: [],
  tStreets: [],
  plazas: [],
  portals: [],
}

const SAVED_PLACE: SavedPlace = {
  id: 'saved-1',
  name: 'My bike',
  position: [-119.21, 40.79],
  address: '3:00 & E',
  savedAt: 0,
}

/**
 * Issue #21: a saved spot chosen from search used to carry only a bare
 * position, so selecting it fell through to the generic geocoded-address
 * path and synthesized a competing dropped pin instead of preserving the
 * saved place's own identity/navigation behavior.
 */
describe('SearchPanel · saved-place search result (#21)', () => {
  const renderPanel = () => {
    const onGo = vi.fn()
    const onGoToPlace = vi.fn()
    const onOpenUnplaced = vi.fn()
    render(
      <SearchPanel
        layout={LAYOUT}
        pois={[]}
        unplaced={[]}
        places={[SAVED_PLACE]}
        onGo={onGo}
        onGoToPlace={onGoToPlace}
        onOpenUnplaced={onOpenUnplaced}
      />,
    )
    return { onGo, onGoToPlace, onOpenUnplaced }
  }

  it('routes a selected saved result through onGoToPlace, not onGo', () => {
    const { onGo, onGoToPlace } = renderPanel()

    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'My bike' } })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onGoToPlace).toHaveBeenCalledTimes(1)
    expect(onGoToPlace).toHaveBeenCalledWith(SAVED_PLACE)
    expect(onGo).not.toHaveBeenCalled()
  })
})

/**
 * Issue #64: search only scored `poi.name` and `poi.address`, so a word
 * living purely in a camp's description — "coffee", "karaoke" — returned
 * nothing even though the offline data already has it.
 */
describe('SearchPanel · description search (#64)', () => {
  const CAFE: Poi = {
    uid: 'camp-cafe',
    kind: 'camp',
    name: 'Bag o Dicks',
    description: 'A quiet spot for coffee and conversation, open all week.',
    position: [-119.21, 40.79],
    positionSource: 'address',
    accuracyClass: 'derived',
  }
  const KARAOKE_CAMP: Poi = {
    uid: 'camp-karaoke',
    kind: 'camp',
    name: 'Karaoke Kamp',
    position: [-119.21, 40.79],
    positionSource: 'address',
    accuracyClass: 'derived',
  }
  const UNPLACED_ART: UnplacedListing = {
    uid: 'art-unplaced',
    kind: 'art',
    name: 'Whispering Dunes',
    description: 'An interactive sauna experience lit from within.',
    reason: 'embargoed',
  }

  const renderPanel = (pois: Poi[], unplaced: UnplacedListing[] = []) => {
    const onGo = vi.fn()
    render(
      <SearchPanel
        layout={LAYOUT}
        pois={pois}
        unplaced={unplaced}
        places={[]}
        onGo={onGo}
        onGoToPlace={vi.fn()}
        onOpenUnplaced={vi.fn()}
      />,
    )
    return { onGo }
  }

  it('finds a POI by a word that only lives in its description', () => {
    renderPanel([CAFE, KARAOKE_CAMP])
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'coffee' } })

    expect(screen.getByText('Bag o Dicks')).toBeDefined()
    expect(screen.queryByText('Karaoke Kamp')).toBeNull()
  })

  it('ranks a name match above a description-only match on the same term', () => {
    // "karaoke" appears in one camp's name and only in the other's description.
    const described: Poi = { ...CAFE, name: 'Quiet Corner', description: 'Karaoke happens here too, quietly.' }
    renderPanel([described, KARAOKE_CAMP])
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'karaoke' } })

    const options = screen.getAllByRole('option').map((el) => el.textContent ?? '')
    const nameHit = options.findIndex((text) => text.includes('Karaoke Kamp'))
    const descHit = options.findIndex((text) => text.includes('Quiet Corner'))
    expect(nameHit).toBeGreaterThanOrEqual(0)
    expect(descHit).toBeGreaterThanOrEqual(0)
    expect(nameHit).toBeLessThan(descHit)
  })

  it('finds an unplaced (embargoed) listing by its description, without adding a position', () => {
    renderPanel([], [UNPLACED_ART])
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'sauna' } })

    expect(screen.getByText('Whispering Dunes')).toBeDefined()
  })
})
