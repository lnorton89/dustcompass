/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '@mui/material'
import { ErrorBoundary } from '../ErrorBoundary'
import { playaTheme } from '../theme'

function Boom({ fail }: { fail: boolean }): React.ReactElement {
  if (fail) throw new Error('layout.json is not a city')
  return <div>the map</div>
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React logs the caught error; that is expected here, not a test failure.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    // Auto-cleanup only registers when vitest runs with globals enabled, and
    // this suite does not, so renders would otherwise pile up between tests.
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders children while nothing is wrong', () => {
    render(
      <ErrorBoundary>
        <Boom fail={false} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('the map')).toBeDefined()
  })

  it('catches a render crash instead of blanking the screen', () => {
    render(
      <ErrorBoundary>
        <Boom fail />
      </ErrorBoundary>,
    )
    expect(screen.getByText('The map stopped working')).toBeDefined()
  })

  it('shows the actual error rather than a generic apology', () => {
    render(
      <ErrorBoundary>
        <Boom fail />
      </ErrorBoundary>,
    )
    expect(screen.getByText('layout.json is not a city')).toBeDefined()
  })

  /** The recovery advice has to be true offline, which is where it will be read. */
  it('offers recovery that works without a connection', () => {
    render(
      <ErrorBoundary>
        <Boom fail />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('button', { name: 'Reload' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Reset saved settings' })).toBeNull()
    expect(screen.getByText(/stored on this device/)).toBeDefined()
  })

  /**
   * ErrorBoundary itself declares no ThemeProvider (see the comment on the
   * class) — it depends entirely on ClientApp wrapping it in one. This proves
   * that dependency actually matters: rendered with no theme context at all
   * (App's own ThemeProvider unmounted by the crash, nothing standing in for
   * it), MUI falls back to its own built-in default theme, which is light.
   * ClientApp's fix is a stable outer `playaTheme('dark')` shell — reproduced
   * here directly, rather than importing ClientApp, so the test exercises the
   * mechanism (a real ThemeProvider around the fallback) without dragging in
   * next/dynamic and the full App bundle it code-splits.
   */
  it('falls back to MUI light-default styling with no ambient theme at all', () => {
    render(
      <ErrorBoundary>
        <Boom fail />
      </ErrorBoundary>,
    )
    // MUI's own built-in default theme, not Dust Compass's — this is the bug:
    // white, not the dark/red palette playaTheme() defines.
    expect(getComputedStyle(screen.getByTestId('crash-fallback')).backgroundColor).toBe(
      'rgb(255, 255, 255)',
    )
  })

  it('renders a dark surface, not MUI light-default, when wrapped in the outer shell theme', () => {
    const { unmount } = render(
      <ErrorBoundary>
        <Boom fail />
      </ErrorBoundary>,
    )
    const withoutTheme = getComputedStyle(screen.getByTestId('crash-fallback')).backgroundColor
    unmount()

    // The exact shell ClientApp.tsx builds: playaTheme('dark') as an outer
    // ThemeProvider around ErrorBoundary, independent of whatever mode (or
    // lack of one) App's own inner ThemeProvider was in when it crashed.
    render(
      <ThemeProvider theme={playaTheme('dark')}>
        <ErrorBoundary>
          <Boom fail />
        </ErrorBoundary>
      </ThemeProvider>,
    )
    const withTheme = getComputedStyle(screen.getByTestId('crash-fallback')).backgroundColor

    // The before/after diff is what actually proves the fix does something —
    // not just that some color string appears, but that wrapping the same
    // crash fallback in the new outer theme changes what it paints.
    expect(withTheme).not.toBe(withoutTheme)
    expect(withTheme).not.toBe('rgb(255, 255, 255)')
  })
})
