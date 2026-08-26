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
  kind: 'direct',
  meters: 100,
  coordinates: [[-119.2, 40.78], [-119.199, 40.781]],
}

const base = {
  open: true,
  compact: false,
  layout,
  pois: [],
  events: [],
  places: [],
  mode: 'walk' as const,
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

afterEach(cleanup)

describe('Directions destination resolution (#160)', () => {
  it('shows a stale destination for a live origin and refuses to re-share it', () => {
    render(
      <DirectionsPanel
        {...base}
        from={{ kind: 'live' }}
        to={{ kind: 'poi', uid: 'removed-poi' }}
        hasUsableLiveFix
        destinationResolved={false}
      />,
    )

    expect(screen.getByText(/Destination is no longer in the current map/i)).toBeDefined()
    expect((screen.getByRole('button', { name: 'Share link' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Route card' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Start navigation' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/follows your live GPS position/i)).toBeDefined()
  })

  it('shows the same destination failure for a fixed origin', () => {
    render(
      <DirectionsPanel
        {...base}
        from={{ kind: 'man' }}
        to={{ kind: 'poi', uid: 'removed-poi' }}
        hasUsableLiveFix={false}
        destinationResolved={false}
      />,
    )
    expect(screen.getByText(/Destination is no longer in the current map/i)).toBeDefined()
    expect((screen.getByRole('button', { name: 'Share link' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('keeps GPS-unavailable and destination-invalid states distinct', () => {
    render(
      <DirectionsPanel
        {...base}
        from={{ kind: 'live' }}
        to={{ kind: 'fixed', label: 'Camp', position: [-119.199, 40.781] }}
        hasUsableLiveFix={false}
        destinationResolved
        preview={undefined}
      />,
    )
    expect(screen.getByText(/Your location is unavailable here/i)).toBeDefined()
    expect(screen.queryByText(/Destination is no longer/i)).toBeNull()
    expect((screen.getByRole('button', { name: 'Share link' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('enables route actions only when the destination and route resolve', () => {
    render(
      <DirectionsPanel
        {...base}
        from={{ kind: 'man' }}
        to={{ kind: 'fixed', label: 'Camp', position: [-119.199, 40.781] }}
        hasUsableLiveFix={false}
        destinationResolved
        preview={{
          fromLabel: 'The Man',
          toLabel: 'Camp',
          route,
          travel: { meters: 100, feet: 328, miles: 0.062, walkMinutes: 1.45, bikeMinutes: 0.54 },
          heading: '4:30',
        }}
      />,
    )
    expect((screen.getByRole('button', { name: 'Share link' }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: 'Start navigation' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
