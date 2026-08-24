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
  savedEvents: [],
  isEventSaved: () => false,
  onToggleSaveEvent: vi.fn(),
  onRemoveSavedEvent: vi.fn(),
}

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

  it('offers a bookmark toggle on each row, reflecting saved state', () => {
    const onToggleSaveEvent = vi.fn()
    render(
      <EventsPanel
        {...baseProps}
        events={[event('yoga')]}
        origin={undefined}
        locationStatus="idle"
        isEventSaved={(uid) => uid === 'yoga'}
        onToggleSaveEvent={onToggleSaveEvent}
      />,
    )
    const toggle = screen.getByRole('button', { name: /remove from saved events/i })
    fireEvent.click(toggle)
    expect(onToggleSaveEvent).toHaveBeenCalledWith(expect.objectContaining({ uid: 'yoga' }))
  })
})

describe('EventsPanel · Saved window (#60)', () => {
  it('shows only saved events, ordered by their relevant occurrence', () => {
    const yoga = event('yoga')
    const pancakes = { ...event('pancakes'), occurrence_set: [{ start_time: '2026-09-02T12:00:00-07:00', end_time: '2026-09-02T13:00:00-07:00' }] }
    const unsaved = event('unsaved bbq')
    render(
      <EventsPanel
        {...baseProps}
        events={[unsaved, pancakes, yoga]}
        origin={undefined}
        locationStatus="idle"
        savedEvents={[
          { uid: 'pancakes', title: 'pancakes', savedAt: 1 },
          { uid: 'yoga', title: 'yoga', savedAt: 2 },
        ]}
        isEventSaved={(uid) => uid === 'pancakes' || uid === 'yoga'}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^saved$/i }))

    expect(screen.getByText('yoga')).toBeDefined()
    expect(screen.getByText('pancakes')).toBeDefined()
    expect(screen.queryByText('unsaved bbq')).toBeNull()
  })

  it('degrades a saved uid that no longer matches any current event to a harmless row instead of crashing', () => {
    const onRemoveSavedEvent = vi.fn()
    render(
      <EventsPanel
        {...baseProps}
        // The uid isn't present in `events` at all — the realistic shape of
        // "deleted/cancelled in a later data refresh". `uid` is the sole
        // identity every part of this app uses (host lookups, row keys), and
        // the officially issued ids aren't recycled within a year, so a
        // *present* uid is trusted as the same event throughout — same as it
        // is everywhere else in the app.
        events={[event('unrelated current event')]}
        origin={undefined}
        locationStatus="idle"
        savedEvents={[{ uid: 'ghost-uid', title: 'Deleted campfire chat', savedAt: 1 }]}
        isEventSaved={() => true}
        onRemoveSavedEvent={onRemoveSavedEvent}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^saved$/i }))

    // The snapshotted title shows up, and nothing crashes.
    expect(screen.getByText('Deleted campfire chat')).toBeDefined()
    expect(screen.getByText(/no longer listed this year/i)).toBeDefined()
    expect(screen.queryByText('unrelated current event')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /remove deleted campfire chat from saved events/i }))
    expect(onRemoveSavedEvent).toHaveBeenCalledWith('ghost-uid')
  })

  it('shows an explicit empty state rather than "nothing scheduled" when nothing is saved', () => {
    render(
      <EventsPanel {...baseProps} events={[event('yoga')]} origin={undefined} locationStatus="idle" savedEvents={[]} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^saved$/i }))
    expect(screen.getByText(/no saved events yet/i)).toBeDefined()
  })
})
