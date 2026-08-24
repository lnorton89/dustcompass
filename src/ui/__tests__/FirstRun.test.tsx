/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FirstRun } from '../FirstRun'

describe('FirstRun', () => {
  afterEach(() => {
    // Auto-cleanup only registers when vitest runs with globals enabled, and
    // this suite does not, so renders would otherwise pile up between tests.
    cleanup()
    vi.restoreAllMocks()
  })

  /**
   * The bug: a throwing getItem used to fall through to `return false`
   * (dialog starts closed), silently deleting onboarding for anyone whose
   * storage is blocked. It must now open instead.
   */
  it('opens when localStorage.getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    render(<FirstRun />)
    expect(screen.getByText('Before you set off')).toBeDefined()
  })

  it('does not render open when the seen key is already set', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('seen')

    render(<FirstRun />)
    expect(screen.queryByText('Before you set off')).toBeNull()
  })

  /**
   * dismiss() closes via setOpen(false), a plain React state update, before
   * it ever touches localStorage — so a throwing setItem must not stop the
   * dialog from closing or surface as an unhandled error.
   */
  it('closes on dismiss even when localStorage.setItem throws, without throwing', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    render(<FirstRun />)
    expect(screen.getByText('Before you set off')).toBeDefined()

    expect(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Show me the map' }))
    }).not.toThrow()

    // The close itself is synchronous React state (setOpen(false)); MUI's
    // Dialog just keeps the content mounted through its exit transition, so
    // the assertion has to outlast that transition rather than the write.
    await waitFor(() => expect(screen.queryByText('Before you set off')).toBeNull())
  })
})
