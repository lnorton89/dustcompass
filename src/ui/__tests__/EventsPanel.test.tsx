/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventsPanel } from '../EventsPanel'
import type { EventItem } from '../../data/types'

afterEach(() => cleanup())

const event = (title: string): EventItem => ({
  uid: title,
  title,
  event_id: 1,
  year: 2026,
  occurrence_set: [{ start_time: '2026-09-02T10:00:00-07:00', end_time: '2026-09-02T11:00:00-07:00' }],
})

const baseProps = {
  open: true,
  events: [event('yoga')],
  hosts: new Map(),
  now: new Date('2026-09-02T10:30:00-07:00'),
  preview: false,
  onSelect: vi.fn(),
  onClose: vi.fn(),
  onDoneWithLocation: vi.fn(),
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
