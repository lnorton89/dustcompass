/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from '../ErrorBoundary'

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
})
