/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CityLayout } from '../../brc/layout'
import type { PlayaRoute } from '../../brc/routing'
import { DirectionsPanel } from '../DirectionsPanel'

const layout: CityLayout = {
  center: { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [-119.2, 40.78] } },
  bearing: 45,
  fence_distance: 10000,
  road_width: 40,
  cStreets: [],
  tStreets: [],
  plazas: [],
  portals: [],
}

const route: PlayaRoute = {
  kind: 'street',
  meters: 300,
  coordinates: [[-119.2, 40.78], [-119.19, 40.785]],
}

const baseProps = {
  open: true,
  compact: false,
  layout,
  pois: [],
  events: [],
  places: [],
  from: { kind: 'man' as const },
  mode: 'walk' as const,
  hasUsableLiveFix: false,
  findingLocation: false,
  onFromChange: vi.fn(),
  onToChange: vi.fn(),
  onModeChange: vi.fn(),
  onSwap: vi.fn(),
  onStart: vi.fn(),
  onShare: vi.fn(),
  onShareImage: vi.fn(),
  onClose: vi.fn(),
}

afterEach(() => cleanup())

describe('DirectionsPanel', () => {
  it('shows the selected From endpoint instead of a blank controlled autocomplete', () => {
    render(<DirectionsPanel {...baseProps} />)
    expect((screen.getByRole('combobox', { name: 'From' }) as HTMLInputElement).value).toBe('The Man')
    expect((screen.getByRole('button', { name: 'Start navigation' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('makes the selected travel mode the primary ETA and explains routed semantics', () => {
    render(
      <DirectionsPanel
        {...baseProps}
        to={{ kind: 'fixed', label: 'Camp', position: [-119.19, 40.785] }}
        mode="bike"
        preview={{
          fromLabel: 'The Man',
          toLabel: 'Camp',
          route,
          travel: { meters: 300, feet: 984, miles: 0.186, walkMinutes: 4.35, bikeMinutes: 1.61 },
          heading: '4:30',
        }}
      />,
    )
    const summary = screen.getByTestId('directions-summary')
    expect(summary.textContent).toContain('2 min')
    expect(summary.textContent).not.toContain('4 min')
    expect(summary.textContent).toMatch(/Surveyed street route around occupied blocks/i)
    expect(summary.textContent).toContain('head toward 4:30')
    expect((screen.getByRole('button', { name: 'Start navigation' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
