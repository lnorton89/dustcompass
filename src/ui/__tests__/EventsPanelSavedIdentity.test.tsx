/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CityLayout } from '../../brc/layout'
import type { EventItem } from '../../data/types'
import { EventsPanel } from '../EventsPanel'

const layout: CityLayout = {
  center: { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [-119.2, 40.78] } },
  bearing: 45,
  fence_distance: 10560,
  road_width: 40,
  cStreets: [],
  tStreets: [],
  plazas: [],
  portals: [],
}

function event(title: string, eventId: number): EventItem {
  return {
    uid: 'reused-uid',
    title,
    event_id: eventId,
    year: 2026,
    occurrence_set: [{ start_time: '2026-09-02T10:00:00-07:00', end_time: '2026-09-02T11:00:00-07:00' }],
  }
}

const base = {
  open: true,
  hosts: new Map(),
  layout,
  now: new Date('2026-09-02T10:30:00-07:00'),
  preview: false,
  origin: undefined,
  locationStatus: 'idle' as const,
  onSelectEvent: vi.fn(),
  onClose: vi.fn(),
  onNeedLocation: vi.fn(),
  onDoneWithLocation: vi.fn(),
  isEventSaved: () => true,
  onToggleSaveEvent: vi.fn(),
  onRemoveSavedEvent: vi.fn(),
}

afterEach(cleanup)

describe('EventsPanel saved identity continuity (#164)', () => {
  it('renders a reused uid as stale instead of silently binding the bookmark to the new event', () => {
    const current = event('Midnight Fire Jam', 99)
    render(
      <EventsPanel
        {...base}
        events={[current]}
        savedEvents={[{ uid: 'reused-uid', title: 'Morning Coffee', savedAt: 1, eventId: 42 }]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^saved$/i }))

    expect(screen.getByText('Morning Coffee')).toBeDefined()
    expect(screen.getByText(/no longer listed this year/i)).toBeDefined()
    expect(screen.queryByText('Midnight Fire Jam')).toBeNull()
  })

  it('keeps a normal title update saved when event_id proves identity continuity', () => {
    const current = event('Morning Coffee — updated details', 42)
    render(
      <EventsPanel
        {...base}
        events={[current]}
        savedEvents={[{ uid: 'reused-uid', title: 'Morning Coffee', savedAt: 1, eventId: 42 }]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^saved$/i }))

    expect(screen.getByText('Morning Coffee — updated details')).toBeDefined()
    expect(screen.queryByText(/no longer listed this year/i)).toBeNull()
  })
})
