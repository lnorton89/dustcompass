/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SearchPanel, optionIcon } from '../SearchPanel'
import type { CityLayout } from '../../brc/layout'
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
