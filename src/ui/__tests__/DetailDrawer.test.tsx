/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DetailDrawer } from '../DetailDrawer'
import type { EventItem, Poi } from '../../data/types'

afterEach(() => cleanup())

const poi = (uid: string, name: string): Poi => ({
  uid,
  kind: 'camp',
  name,
  position: [-119.2, 40.78],
  positionSource: 'gps',
  accuracyClass: 'surveyed',
})

const baseProps = {
  events: [],
  origin: [-119.2, 40.78] as [number, number],
  originLabel: 'the Man',
  now: new Date('2026-08-29T12:00:00-07:00'),
  isFavorite: false,
  canFavorite: false,
  onToggleFavorite: vi.fn(),
  onShare: vi.fn(),
  onNavigate: vi.fn(),
  onSelectEvent: vi.fn(),
  onClose: vi.fn(),
  compact: true,
}

/**
 * Issue #45: `civicPois()` keeps every survey-derived place at `kind:
 * 'service'` so filters/favorites keep treating them as one group, but The
 * Temple, Gate Actual and Yellow Bike Project are not services — the CPNS
 * survey's own `category` already says so. The kind chip has to read that
 * classification instead of falling back to the generic "Service" label.
 */
describe('DetailDrawer · kind chip for CPNS categories (#45)', () => {
  const civicPoi = (category: Poi['category'], name: string): Poi => ({
    uid: 'service:test',
    kind: 'service',
    name,
    category,
    position: [-119.2, 40.78],
    positionSource: 'gps',
    accuracyClass: 'surveyed',
  })

  it('labels a landmark as Landmark, not Service', () => {
    render(<DetailDrawer {...baseProps} poi={civicPoi('landmark', 'The Temple')} />)
    expect(screen.getByText('Landmark')).toBeDefined()
    expect(screen.queryByText('Service')).toBeNull()
  })

  it('labels arrival infrastructure as Arrival, not Service', () => {
    render(<DetailDrawer {...baseProps} poi={civicPoi('arrival', 'Gate Actual')} />)
    expect(screen.getByText('Arrival')).toBeDefined()
    expect(screen.queryByText('Service')).toBeNull()
  })

  it('labels participant info as Info, not Service', () => {
    render(<DetailDrawer {...baseProps} poi={civicPoi('info', 'Yellow Bike Project')} />)
    expect(screen.getByText('Info')).toBeDefined()
    expect(screen.queryByText('Service')).toBeNull()
  })

  it('still labels a genuine service (ranger station) as Service', () => {
    render(<DetailDrawer {...baseProps} poi={civicPoi('ranger', 'Ranger HQ')} />)
    expect(screen.getByText('Service')).toBeDefined()
  })
})

/**
 * Issue #61: a camp/art record's API-published GPS is best-effort per
 * Burning Man's own documentation, not surveyed — but the detail view used
 * to drop its approximation caveat entirely the moment any GPS field
 * existed, the same as it does for the GIS survey's genuinely surveyed
 * civic points. `accuracyClass` now distinguishes the three cases.
 */
describe('DetailDrawer · position accuracy caveat (#61)', () => {
  const campPoi = (accuracyClass: Poi['accuracyClass'], address?: string): Poi => ({
    uid: 'camp:test',
    kind: 'camp',
    name: 'Test Camp',
    address,
    position: [-119.2, 40.78],
    positionSource: accuracyClass === 'derived' ? 'address' : 'gps',
    accuracyClass,
  })

  it('shows the address caveat for a derived (geocoded) pin', () => {
    render(<DetailDrawer {...baseProps} poi={campPoi('derived', '6:00 & Esplanade')} />)
    expect(screen.getByText(/Approximate pin at/)).toBeDefined()
  })

  it('shows a distinct best-effort caveat for API-published GPS, not the address one', () => {
    render(<DetailDrawer {...baseProps} poi={campPoi('published')} />)
    expect(screen.getByText(/Officially published location/)).toBeDefined()
    expect(screen.queryByText(/Approximate pin at/)).toBeNull()
  })

  it('shows no position caveat for a genuinely surveyed civic point', () => {
    render(<DetailDrawer {...baseProps} poi={campPoi('surveyed')} />)
    expect(screen.queryByText(/Approximate pin at/)).toBeNull()
    expect(screen.queryByText(/Officially published location/)).toBeNull()
  })
})

/**
 * Issue #19: a plain ref callback on the sheet's Paper only fires when that
 * node is created or destroyed. Switching from one open listing straight to
 * another (without closing first) keeps the same Paper mounted the whole
 * time, so the old approach never re-measured — `flyTo()`'s camera framing
 * kept using whichever listing's height had been measured first, however
 * different the next listing's actual content was. A `ResizeObserver` on the
 * same persistent node instead fires on every layout-affecting change,
 * whatever caused it.
 */
describe('DetailDrawer · onMeasure (#19)', () => {
  let observed: Element[] = []
  let triggerResize: ((height: number) => void) | undefined

  beforeEach(() => {
    observed = []
    triggerResize = undefined
    class FakeResizeObserver {
      callback: ResizeObserverCallback
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback
      }
      observe(target: Element) {
        observed.push(target)
        triggerResize = (height: number) =>
          this.callback(
            [{ target, contentRect: { height } } as unknown as ResizeObserverEntry],
            this as unknown as ResizeObserver,
          )
      }
      unobserve() {
        /* not exercised */
      }
      disconnect() {
        triggerResize = undefined
      }
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  })

  it('measures the sheet as soon as it mounts', () => {
    const onMeasure = vi.fn()
    render(<DetailDrawer {...baseProps} poi={poi('a', 'Camp A')} onMeasure={onMeasure} />)

    expect(onMeasure).toHaveBeenCalledTimes(1)
    expect(observed).toHaveLength(1)
  })

  it('measures again when switching directly from one open listing to another', () => {
    const onMeasure = vi.fn()
    const { rerender } = render(
      <DetailDrawer {...baseProps} poi={poi('a', 'Camp A')} onMeasure={onMeasure} />,
    )
    expect(onMeasure).toHaveBeenCalledTimes(1)

    rerender(
      <DetailDrawer
        {...baseProps}
        poi={poi('b', 'A much longer camp name, chosen right after Camp A')}
        onMeasure={onMeasure}
      />,
    )

    // Exactly the regression: the old ref-callback approach left this at 1,
    // since the underlying Paper node never unmounted between the two.
    expect(onMeasure.mock.calls.length).toBeGreaterThan(1)
  })

  it('does not measure again on an unrelated re-render with the same listing', () => {
    const onMeasure = vi.fn()
    const { rerender } = render(
      <DetailDrawer {...baseProps} poi={poi('a', 'Camp A')} onMeasure={onMeasure} />,
    )
    expect(onMeasure).toHaveBeenCalledTimes(1)

    rerender(<DetailDrawer {...baseProps} poi={poi('a', 'Camp A')} onMeasure={onMeasure} isFavorite />)

    expect(onMeasure).toHaveBeenCalledTimes(1)
  })

  it('reports a later resize too, e.g. a lazy-loaded image finishing after the sheet opened', () => {
    const onMeasure = vi.fn()
    render(<DetailDrawer {...baseProps} poi={poi('a', 'Camp A')} onMeasure={onMeasure} />)
    onMeasure.mockClear()

    triggerResize?.(480)

    expect(onMeasure).toHaveBeenCalledWith(480)
  })

  it('stops observing once the component unmounts', () => {
    // Drawer's own close transition is asynchronous (CSS-timed) and not
    // useful to depend on here — unmounting the component directly is the
    // reliable way to exercise the observer's own cleanup.
    const onMeasure = vi.fn()
    const { unmount } = render(
      <DetailDrawer {...baseProps} poi={poi('a', 'Camp A')} onMeasure={onMeasure} />,
    )
    unmount()

    onMeasure.mockClear()
    triggerResize?.(999)
    expect(onMeasure).not.toHaveBeenCalled()
  })
})

const hostedEvent = (uid: string): EventItem => ({
  uid,
  title: `Event ${uid}`,
  event_id: 1,
  year: 2026,
  occurrence_set: [{ start_time: '2026-08-29T12:00:00-07:00', end_time: '2026-08-29T13:00:00-07:00' }],
})

/**
 * Issue #28: the heading promised the full event count while the list
 * silently cut off at 40 with no indication anything was missing or way to
 * reach the rest.
 */
describe('DetailDrawer · hosted events beyond the 40-event cap (#28)', () => {
  const manyEvents = Array.from({ length: 53 }, (_, index) => hostedEvent(String(index)))

  it('discloses that only 40 of a larger total are shown', () => {
    render(<DetailDrawer {...baseProps} poi={poi('a', 'Camp A')} events={manyEvents} />)
    expect(screen.getByText(/53 events/i)).toBeDefined()
    expect(screen.getByText(/showing 40/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /show all 53/i })).toBeDefined()
  })

  it('reveals every event once "Show all" is pressed', () => {
    render(<DetailDrawer {...baseProps} poi={poi('a', 'Camp A')} events={manyEvents} />)
    fireEvent.click(screen.getByRole('button', { name: /show all 53/i }))

    expect(screen.getByText('Event 52')).toBeDefined()
    expect(screen.queryByRole('button', { name: /show all/i })).toBeNull()
  })

  it('does not disclose anything when every event already fits', () => {
    const fewEvents = manyEvents.slice(0, 5)
    render(<DetailDrawer {...baseProps} poi={poi('a', 'Camp A')} events={fewEvents} />)
    expect(screen.queryByText(/showing 40/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /show all/i })).toBeNull()
  })

  it('collapses back to 40 when switching to a different listing', () => {
    const { rerender } = render(
      <DetailDrawer {...baseProps} poi={poi('a', 'Camp A')} events={manyEvents} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /show all 53/i }))
    expect(screen.queryByRole('button', { name: /show all/i })).toBeNull()

    rerender(<DetailDrawer {...baseProps} poi={poi('b', 'Camp B')} events={manyEvents} />)
    expect(screen.getByRole('button', { name: /show all 53/i })).toBeDefined()
  })
})

/**
 * Issue #20: hosted events used to render as plain, noninteractive text —
 * reading the title and time here was as far as it went. Every row now
 * opens the event's own detail.
 */
describe('DetailDrawer · hosted event rows open event detail (#20)', () => {
  it('opens the event detail when a hosted-event row is clicked', () => {
    const onSelectEvent = vi.fn()
    const single = hostedEvent('only')
    render(
      <DetailDrawer
        {...baseProps}
        poi={poi('a', 'Camp A')}
        events={[single]}
        onSelectEvent={onSelectEvent}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Event only/i }))
    expect(onSelectEvent).toHaveBeenCalledWith(single)
  })
})
