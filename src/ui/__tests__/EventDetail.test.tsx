/**
 * @vitest-environment jsdom
 */
import { existsSync, readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventDetail } from '../EventDetail'
import type { CityLayout } from '../../brc/layout'
import { DATA_YEAR } from '../../config'
import type { EventItem, Poi } from '../../data/types'

afterEach(() => cleanup())

const host: Poi = {
  uid: 'camp-1',
  kind: 'camp',
  name: 'Test Camp',
  address: '3:00 & Esplanade',
  position: [-119.206, 40.782],
  positionSource: 'gps',
  accuracyClass: 'surveyed',
}

const baseEvent: EventItem = {
  uid: 'evt-1',
  title: 'Sunrise Yoga',
  event_id: 1,
  year: 2026,
  description: 'Bring a mat and an open mind.',
  event_type: { label: 'Class', abbr: 'clas' },
  occurrence_set: [{ start_time: '2026-09-02T06:00:00-07:00', end_time: '2026-09-02T07:00:00-07:00' }],
}

/**
 * Issue #20: an event's own description used to be unreachable from either
 * the Events list or a host's detail sheet — selecting an event opened the
 * host (or, with no host, did nothing), and the host detail listed hosted
 * events as plain, noninteractive text. This is the detail both now open.
 *
 * Wrapped in a plain `if`, not `describe.runIf`: vitest still calls a
 * `describe.runIf` callback to collect its tests regardless of the
 * condition, so reading the real layout fixture below would throw during
 * collection on a checkout that has fetched a different year's data than
 * `DATA_YEAR` names (CI fetches one year and only one). An `if` around the
 * whole `describe` call never invokes it — and every test here needs the
 * real geocoder, so there is nothing fixture-independent left to run
 * without it.
 */
const layoutPath = `public/data/${DATA_YEAR}/layout.json`
if (existsSync(layoutPath)) {
  const layout = JSON.parse(readFileSync(layoutPath, 'utf8')) as CityLayout

  describe('EventDetail', () => {
    it('is closed when there is no event', () => {
      render(
        <EventDetail
          event={undefined}
          layout={layout}
          now={new Date()}
          isSaved={false}
          onToggleSave={vi.fn()}
          onClose={vi.fn()}
          onNavigate={vi.fn()}
        />,
      )
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('shows the description, occurrence time, and host — with a working "Take me there"', () => {
      const onNavigate = vi.fn()
      render(
        <EventDetail
          event={baseEvent}
          host={host}
          layout={layout}
          now={new Date('2026-09-02T06:30:00-07:00')}
          isSaved={false}
          onToggleSave={vi.fn()}
          onClose={vi.fn()}
          onNavigate={onNavigate}
        />,
      )
      expect(screen.getByText('Sunrise Yoga')).toBeDefined()
      expect(screen.getByText('Bring a mat and an open mind.')).toBeDefined()
      expect(screen.getByText(/Test Camp/)).toBeDefined()
      expect(screen.getByText(/on now/)).toBeDefined()

      fireEvent.click(screen.getByRole('button', { name: /take me there/i }))
      expect(onNavigate).toHaveBeenCalledWith(host)
    })

    it('falls back to print_description when description is missing', () => {
      const event = { ...baseEvent, description: undefined, print_description: 'Printed blurb.' }
      render(
        <EventDetail
          event={event}
          layout={layout}
          now={new Date()}
          isSaved={false}
          onToggleSave={vi.fn()}
          onClose={vi.fn()}
          onNavigate={vi.fn()}
        />,
      )
      expect(screen.getByText('Printed blurb.')).toBeDefined()
    })

    it('says nothing was published rather than leaving the description blank', () => {
      const event = { ...baseEvent, description: undefined, print_description: undefined }
      render(
        <EventDetail
          event={event}
          layout={layout}
          now={new Date()}
          isSaved={false}
          onToggleSave={vi.fn()}
          onClose={vi.fn()}
          onNavigate={vi.fn()}
        />,
      )
      expect(screen.getByText(/no description published/i)).toBeDefined()
    })

    it('with no host and no other_location, says the location is not listed and offers no navigation', () => {
      render(
        <EventDetail
          event={baseEvent}
          layout={layout}
          now={new Date()}
          isSaved={false}
          onToggleSave={vi.fn()}
          onClose={vi.fn()}
          onNavigate={vi.fn()}
        />,
      )
      expect(screen.getByText('Location not listed.')).toBeDefined()
      expect(screen.queryByRole('button', { name: /take me there/i })).toBeNull()
    })

    it('shows free-form other_location text as unmapped rather than "not listed", with no navigation', () => {
      const event = { ...baseEvent, other_location: 'ask around at the tiki bar' }
      render(
        <EventDetail
          event={event}
          layout={layout}
          now={new Date()}
          isSaved={false}
          onToggleSave={vi.fn()}
          onClose={vi.fn()}
          onNavigate={vi.fn()}
        />,
      )
      expect(screen.getByText(/ask around at the tiki bar/)).toBeDefined()
      expect(screen.getByText(/not mapped/i)).toBeDefined()
      expect(screen.queryByText('Location not listed.')).toBeNull()
      expect(screen.queryByRole('button', { name: /take me there/i })).toBeNull()
    })

    it('resolves a parseable other_location address and offers navigation to it', () => {
      const onNavigate = vi.fn()
      const event = { ...baseEvent, other_location: 'D & 3:15' }
      render(
        <EventDetail
          event={event}
          layout={layout}
          now={new Date()}
          isSaved={false}
          onToggleSave={vi.fn()}
          onClose={vi.fn()}
          onNavigate={onNavigate}
        />,
      )
      expect(screen.getByText(/D & 3:15/)).toBeDefined()

      fireEvent.click(screen.getByRole('button', { name: /take me there/i }))
      expect(onNavigate).toHaveBeenCalledTimes(1)
      const target = onNavigate.mock.calls[0][0]
      expect(target.name).toBe('Sunrise Yoga')
      expect(target.address).toBe('D & 3:15')
      expect(target.position).toBeDefined()
    })

    it('closes when the close button is pressed', () => {
      const onClose = vi.fn()
      render(
        <EventDetail
          event={baseEvent}
          layout={layout}
          now={new Date()}
          isSaved={false}
          onToggleSave={vi.fn()}
          onClose={onClose}
          onNavigate={vi.fn()}
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: /close event details/i }))
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('offers a bookmark toggle whose label and icon reflect saved state', () => {
      const onToggleSave = vi.fn()
      render(
        <EventDetail
          event={baseEvent}
          layout={layout}
          now={new Date()}
          isSaved={false}
          onToggleSave={onToggleSave}
          onClose={vi.fn()}
          onNavigate={vi.fn()}
        />,
      )
      const save = screen.getByRole('button', { name: /save this event/i })
      fireEvent.click(save)
      expect(onToggleSave).toHaveBeenCalledTimes(1)
    })

    it('labels the toggle as remove when the event is already saved', () => {
      render(
        <EventDetail
          event={baseEvent}
          layout={layout}
          now={new Date()}
          isSaved={true}
          onToggleSave={vi.fn()}
          onClose={vi.fn()}
          onNavigate={vi.fn()}
        />,
      )
      expect(screen.getByRole('button', { name: /remove from saved events/i })).toBeDefined()
    })
  })
} else {
  // Every case here needs the real geocoder, so there is nothing left to
  // run without the fixture — but a file with zero registered tests is
  // itself a Vitest failure ("No test suite found"), which would read as
  // this suite being broken rather than the fixture being absent. One
  // explicitly skipped placeholder keeps that distinction visible.
  it.skip(`EventDetail (skipped — ${DATA_YEAR} data not fetched)`, () => {})
}
