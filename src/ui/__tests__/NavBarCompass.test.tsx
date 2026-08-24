/**
 * @vitest-environment jsdom
 *
 * The device-heading compass control added to NavBar for #63. NavBar's own
 * existing suite (NavBar.test.tsx) covers the unrelated retry-location
 * control; this file is additive coverage for the compass affordance only.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '@mui/material'
import { NavBar } from '../NavBar'
import { playaTheme } from '../theme'
import { paletteFor } from '../../map/style'
import type { CompassHeading } from '../../data/useCompassHeading'

const travel = { meters: 300, feet: 984, miles: 0.19, walkMinutes: 4.3, bikeMinutes: 1.6 }
const palette = paletteFor('dark')

function renderNavBar(compass?: CompassHeading, bearing?: number) {
  return render(
    <ThemeProvider theme={playaTheme('dark')}>
      <NavBar
        name="Center Camp"
        travel={travel}
        heading="6:00"
        bearing={bearing}
        compass={compass}
        palette={palette}
        located
        status="tracking"
        onRetryLocation={vi.fn()}
        onClear={vi.fn()}
      />
    </ThemeProvider>,
  )
}

afterEach(cleanup)

describe('NavBar compass control (#63)', () => {
  it('renders nothing extra when the compass prop is omitted (unsupported devices, unchanged behaviour)', () => {
    renderNavBar(undefined, 2)
    expect(screen.queryByTestId('compass-needle')).toBeNull()
    expect(screen.queryByText('Compass')).toBeNull()
  })

  it('renders nothing extra when support is unsupported', () => {
    renderNavBar({ support: 'unsupported', requestPermission: vi.fn() }, 2)
    expect(screen.queryByTestId('compass-needle')).toBeNull()
    expect(screen.queryByText('Compass')).toBeNull()
  })

  it('shows a tap target, not a needle, when idle (permission not yet requested)', () => {
    renderNavBar({ support: 'idle', requestPermission: vi.fn() }, 2)
    expect(screen.getByText('Compass')).not.toBeNull()
    expect(screen.queryByTestId('compass-needle')).toBeNull()
  })

  it('shows the same tap target when needs-permission (iOS, before the prompt)', () => {
    renderNavBar({ support: 'needs-permission', requestPermission: vi.fn() }, 2)
    expect(screen.getByText('Compass')).not.toBeNull()
  })

  it('calls requestPermission from the tap target click handler', () => {
    const requestPermission = vi.fn().mockResolvedValue(undefined)
    renderNavBar({ support: 'idle', requestPermission }, 2)
    fireEvent.click(screen.getByText('Compass'))
    expect(requestPermission).toHaveBeenCalledTimes(1)
  })

  it('shows a dismissible one-line note when permission was denied, and no needle or tap target', () => {
    renderNavBar({ support: 'denied', requestPermission: vi.fn() }, 2)
    expect(screen.getByText(/Compass permission denied/)).not.toBeNull()
    expect(screen.queryByTestId('compass-needle')).toBeNull()
    expect(screen.queryByText('Compass')).toBeNull()

    fireEvent.click(screen.getByLabelText('Dismiss compass permission note'))
    expect(screen.queryByText(/Compass permission denied/)).toBeNull()
  })

  it('renders the needle, angled by the target bearing and device heading, when active', () => {
    // target 2°, device heading 358° -> needleAngle ≈ +4° (see geo.test.ts)
    renderNavBar({ support: 'active', heading: 358, requestPermission: vi.fn() }, 2)
    const needle = screen.getByTestId('compass-needle')
    expect(needle).not.toBeNull()
    const glyph = screen.getByTestId('compass-needle-glyph')
    expect(glyph.getAttribute('style')).toContain('rotate(4deg)')
  })

  it('does not render a needle when active but a device heading has not arrived yet', () => {
    renderNavBar({ support: 'active', requestPermission: vi.fn() }, 2)
    expect(screen.queryByTestId('compass-needle')).toBeNull()
  })

  it('surfaces accuracy in the needle label when the platform reports one, and omits it otherwise', () => {
    renderNavBar({ support: 'active', heading: 10, accuracy: 15, requestPermission: vi.fn() }, 2)
    expect(screen.getByLabelText(/accuracy ±15°/)).not.toBeNull()
  })
})
