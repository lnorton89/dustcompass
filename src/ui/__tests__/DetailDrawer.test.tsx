/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DetailDrawer } from '../DetailDrawer'
import type { Poi } from '../../data/types'

afterEach(() => cleanup())

const poi = (uid: string, name: string): Poi => ({
  uid,
  kind: 'camp',
  name,
  position: [-119.2, 40.78],
  positionSource: 'gps',
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
  onClose: vi.fn(),
  compact: true,
}

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
