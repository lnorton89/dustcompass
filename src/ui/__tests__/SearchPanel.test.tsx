/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { optionIcon } from '../SearchPanel'

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
