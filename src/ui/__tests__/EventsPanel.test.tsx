/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventsPanel } from '../EventsPanel'
import type { CityLayout } from '../../brc/layout'
import type { EventItem } from '../../data/types'

afterEach(() => cleanup())

const event = (title: string): EventItem => ({
  uid: title,
  title,
  event_id: 1,
  year: 2026,
  occurrence_set: [{ start_time: '2026-09-02T10:00:00-07:00', end_time: '2026-09-02T11:00:00-07:00' }],
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

const baseProps = {
  open: true,
  events: [event('yoga')],
  hosts: new Map(),
  layout: LAYOUT,
  now: new Date('2026-09-02T10:30:00-07:00'),
  preview: false,
  onSelectEvent: vi.fn(),
  onClose: vi.fn(),
  onNeedLocation: vi.fn(),
  onDoneWithLocation: vi.fn(),
}

/**
 * Issue #54: `EventsPanel` used to hard-cap its result set at 300 with no
 * way to browse the rest — `matching.slice(0, 300)` with no continuation.
 * Sorting/filtering still run across the complete set; only how much of it
 * is rendered at once is now paged, with the remainder reachable via
 * "Load more" rather than invisible.
 */
describe('EventsPanel · browsing past the initial page (#54)', () => {
  const manyEvents = Array.from({ length: 350 }, (_, i) => event(`Event ${String(i).padStart(3, '0')}`))

  it('caps the initial render at 300 but reports the full match count and offers to load more', () => {
    render(<EventsPanel {...baseProps} events={manyEvents} origin={undefined} locationStatus="idle" />)

    expect(screen.getByText('300 of 350 showing')).toBeDefined()
    expect(screen.queryByText('Event 300')).toBeNull()
    expect(screen.getByRole('button', { name: /load 50 more/i })).toBeDefined()
  })

  it('makes every record past index 300 reachable by loading more', () => {
    render(<EventsPanel {...baseProps} events={manyEvents} origin={undefined} locationStatus="idle" />)

    fireEvent.click(screen.getByRole('button', { name: /load 50 more/i }))

    expect(screen.getByText('Event 300')).toBeDefined()
    expect(screen.getByText('Event 349')).toBeDefined()
    expect(screen.getByText('350 showing')).toBeDefined()
    expect(screen.queryByRole('button', { name: /load.*more/i })).toBeNull()
  })

  it('resets back to the first page when the search term changes', () => {
    render(<EventsPanel {...baseProps} events={manyEvents} origin={undefined} locationStatus="idle" />)

    fireEvent.click(screen.getByRole('button', { name: /load 50 more/i }))
    expect(screen.getByText('350 showing')).toBeDefined()

    // "Event 3" matches only "Event 300".."Event 349" (50 events, all under
    // the page size) — a stale "everything loaded" position from the
    // unfiltered 350 would be meaningless against this much smaller set.
    fireEvent.change(screen.getByPlaceholderText('Search events or camps'), { target: { value: 'Event 3' } })

    expect(screen.getByText('50 showing')).toBeDefined()
    expect(screen.queryByText(/of 350 showing/)).toBeNull()
  })
})

describe('EventsPanel · location failure for "Closest"', () => {
  it('does not leave "Closest" selected while silently falling back to time order on denial', () => {
    const onNeedLocation = vi.fn()
    render(
      <EventsPanel {...baseProps} origin={undefined} locationStatus="denied" onNeedLocation={onNeedLocation} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /closest/i }))
    expect(onNeedLocation).toHaveBeenCalledTimes(1)

    // Denied, not merely still locating: the toggle must not remain selected
    // while the rows are quietly time-sorted underneath it.
    expect(screen.getByRole('button', { name: /closest/i }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText(/location access is off/i)).toBeDefined()
  })

  it('offers an explicit retry that asks for location again', () => {
    const onNeedLocation = vi.fn()
    render(
      <EventsPanel {...baseProps} origin={undefined} locationStatus="unavailable" onNeedLocation={onNeedLocation} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /closest/i }))
    onNeedLocation.mockClear()

    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(onNeedLocation).toHaveBeenCalledTimes(1)
  })

  it('shows "finding you…" rather than a terminal error while still locating', () => {
    render(<EventsPanel {...baseProps} origin={undefined} locationStatus="locating" onNeedLocation={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /closest/i }))

    expect(screen.getByText(/finding you/i)).toBeDefined()
    expect(screen.queryByText(/location access is off/i)).toBeNull()
  })
})

describe('EventsPanel · location ownership lifecycle (#11)', () => {
  it('does not claim location while closed, even when sort defaults to distance', () => {
    const onNeedLocation = vi.fn()
    const onDoneWithLocation = vi.fn()
    render(
      <EventsPanel
        {...baseProps}
        open={false}
        origin={undefined}
        locationStatus="idle"
        onNeedLocation={onNeedLocation}
        onDoneWithLocation={onDoneWithLocation}
      />,
    )
    expect(onNeedLocation).not.toHaveBeenCalled()
  })

  it('releases location on close after having claimed it for "Closest"', () => {
    const onNeedLocation = vi.fn()
    const onDoneWithLocation = vi.fn()
    const { rerender } = render(
      <EventsPanel
        {...baseProps}
        open={true}
        origin={undefined}
        locationStatus="idle"
        onNeedLocation={onNeedLocation}
        onDoneWithLocation={onDoneWithLocation}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /closest/i }))
    expect(onNeedLocation).toHaveBeenCalledTimes(1)
    expect(onDoneWithLocation).not.toHaveBeenCalled()

    rerender(
      <EventsPanel
        {...baseProps}
        open={false}
        origin={undefined}
        locationStatus="idle"
        onNeedLocation={onNeedLocation}
        onDoneWithLocation={onDoneWithLocation}
      />,
    )
    expect(onDoneWithLocation).toHaveBeenCalledTimes(1)
  })

  it('releases location when switching away from "Closest" without closing', () => {
    const onNeedLocation = vi.fn()
    const onDoneWithLocation = vi.fn()
    render(
      <EventsPanel
        {...baseProps}
        open={true}
        origin={undefined}
        locationStatus="idle"
        onNeedLocation={onNeedLocation}
        onDoneWithLocation={onDoneWithLocation}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /closest/i }))
    expect(onNeedLocation).toHaveBeenCalledTimes(1)

    // Clicking "Closest" again toggles the sort back to time order.
    fireEvent.click(screen.getByRole('button', { name: /closest/i }))
    expect(onDoneWithLocation).toHaveBeenCalledTimes(1)
  })
})

describe('EventsPanel · event rows (#20, #29)', () => {
  it('opens the event detail for a row with no registered host, rather than doing nothing', () => {
    const onSelectEvent = vi.fn()
    const unlocated = event('Campfire chat')
    render(
      <EventsPanel {...baseProps} events={[unlocated]} origin={undefined} locationStatus="idle" onSelectEvent={onSelectEvent} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Campfire chat/i }))
    expect(onSelectEvent).toHaveBeenCalledWith(unlocated)
  })

  it('opens the event detail for a located row too — navigation is no longer the row\'s only action', () => {
    const onSelectEvent = vi.fn()
    const hosted = { ...event('Pancakes'), hosted_by_camp: 'camp-1' }
    const host = { uid: 'camp-1', kind: 'camp' as const, name: 'Test Camp', position: [-119.2, 40.78] as [number, number], positionSource: 'gps' as const }
    render(
      <EventsPanel
        {...baseProps}
        events={[hosted]}
        hosts={new Map([['camp-1', host]])}
        origin={undefined}
        locationStatus="idle"
        onSelectEvent={onSelectEvent}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Pancakes/i }))
    expect(onSelectEvent).toHaveBeenCalledWith(hosted)
  })

  it('says "location not listed" only when other_location is truly empty', () => {
    render(
      <EventsPanel {...baseProps} events={[event('No location event')]} origin={undefined} locationStatus="idle" />,
    )
    expect(screen.getByText(/location not listed/i)).toBeDefined()
  })

  it('shows free-form other_location text instead of the contradictory "location not listed"', () => {
    const withLocation = { ...event('BYOB mixer'), other_location: 'ask around at the tiki bar' }
    render(
      <EventsPanel {...baseProps} events={[withLocation]} origin={undefined} locationStatus="idle" />,
    )
    expect(screen.getByText(/ask around at the tiki bar/)).toBeDefined()
    expect(screen.queryByText(/location not listed/i)).toBeNull()
  })
})
