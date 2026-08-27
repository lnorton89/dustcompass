/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CityLayout } from '../../brc/layout'
import type { PlayaRoute } from '../../brc/routing'
import type { EventItem, Poi } from '../../data/types'
import { DirectionsPanel } from '../DirectionsPanel'

const layout: CityLayout = {
  center: { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [-119.2, 40.78] } },
  bearing: 45,
  fence_distance: 10000,
  road_width: 40,
  cStreets: [{ ref: 'esplanade', name: 'Esplanade', distance: 2500, segments: [['2:00', '10:00']] }],
  tStreets: [{ refs: ['7:30'], segments: [[0, 'esplanade']] }],
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
  destinationResolved: true,
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
  it('shows the selected From endpoint and keeps incomplete-route actions disabled', () => {
    render(<DirectionsPanel {...baseProps} />)
    expect((screen.getByRole('combobox', { name: 'From' }) as HTMLInputElement).value).toBe('The Man')
    expect((screen.getByRole('button', { name: 'Swap directions endpoints' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Share link' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Route card' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Start navigation' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('keeps a selected POI labelled as the POI when event aliases target the same camp', () => {
    const camp: Poi = {
      uid: 'camp-1',
      kind: 'camp',
      name: 'The Airship',
      address: '4:30 & D',
      position: [-119.19, 40.785],
      positionSource: 'address',
      accuracyClass: 'derived',
    }
    const event: EventItem = {
      uid: 'event-1',
      title: 'Taco Tuesday with Microphones',
      event_id: 1,
      year: 2026,
      hosted_by_camp: camp.uid,
      occurrence_set: [{ start_time: '2026-09-01T12:00:00-07:00', end_time: '2026-09-01T13:00:00-07:00' }],
    }

    render(
      <DirectionsPanel
        {...baseProps}
        pois={[camp]}
        events={[event]}
        from={{ kind: 'poi', uid: camp.uid }}
      />,
    )

    expect((screen.getByRole('combobox', { name: 'From' }) as HTMLInputElement).value).toBe('The Airship')
  })

  it('offers an event whose other_location is a conservatively geocoded playa address (#136)', async () => {
    const event: EventItem = {
      uid: 'event-other-location',
      title: 'Open Playa Meetup',
      event_id: 2,
      year: 2026,
      other_location: '7:30 & Esplanade',
      occurrence_set: [{ start_time: '2026-09-01T12:00:00-07:00', end_time: '2026-09-01T13:00:00-07:00' }],
    }
    render(<DirectionsPanel {...baseProps} events={[event]} />)
    const to = screen.getByRole('combobox', { name: 'To' })
    fireEvent.change(to, { target: { value: event.title } })
    expect(await screen.findByRole('option', { name: /Open Playa Meetup/i })).toBeDefined()
  })

  it('keeps immediate replacement text under user control after selecting an address (#169)', async () => {
    const camp: Poi = {
      uid: 'camp-airship',
      kind: 'camp',
      name: 'The Airship',
      address: '4:30 & D',
      position: [-119.19, 40.785],
      positionSource: 'address',
      accuracyClass: 'derived',
    }
    const onToChange = vi.fn()
    const address = {
      kind: 'address' as const,
      address: 'Esplanade & 7:30',
      position: [-119.2, 40.78] as [number, number],
    }
    const { rerender } = render(
      <DirectionsPanel
        {...baseProps}
        pois={[camp]}
        to={address}
        onToChange={onToChange}
      />,
    )

    const to = screen.getByRole('combobox', { name: 'To' }) as HTMLInputElement
    expect(to.value).toBe('Esplanade & 7:30')

    fireEvent.change(to, { target: { value: 'The Airship' } })
    expect(to.value).toBe('The Airship')
    const option = await screen.findByRole('option', { name: /The Airship/i })
    fireEvent.click(option)
    expect(onToChange).toHaveBeenCalledWith({ kind: 'poi', uid: camp.uid })

    rerender(
      <DirectionsPanel
        {...baseProps}
        pois={[camp]}
        to={{ kind: 'poi', uid: camp.uid }}
        onToChange={onToChange}
      />,
    )
    expect((screen.getByRole('combobox', { name: 'To' }) as HTMLInputElement).value).toBe('The Airship')
  })

  it('refreshes visible endpoint labels when From and To are swapped programmatically', () => {
    const destination = { kind: 'fixed' as const, label: 'The Airship', position: [-119.19, 40.785] as [number, number] }
    const { rerender } = render(
      <DirectionsPanel
        {...baseProps}
        from={{ kind: 'man' }}
        to={destination}
      />,
    )

    expect((screen.getByRole('combobox', { name: 'From' }) as HTMLInputElement).value).toBe('The Man')
    expect((screen.getByRole('combobox', { name: 'To' }) as HTMLInputElement).value).toBe('The Airship')

    rerender(
      <DirectionsPanel
        {...baseProps}
        from={destination}
        to={{ kind: 'man' }}
      />,
    )

    expect((screen.getByRole('combobox', { name: 'From' }) as HTMLInputElement).value).toBe('The Airship')
    expect((screen.getByRole('combobox', { name: 'To' }) as HTMLInputElement).value).toBe('The Man')
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
    expect((screen.getByRole('button', { name: 'Swap directions endpoints' }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: 'Share link' }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: 'Route card' }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: 'Start navigation' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
