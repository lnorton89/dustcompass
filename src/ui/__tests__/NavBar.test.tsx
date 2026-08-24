/**
 * @vitest-environment jsdom
 *
 * Targeted regression for issue #23: the retry-location control used to be a
 * bare `Typography component="button"`, which never picked up theme.ts's
 * 44px mobile touch floor because that floor is wired to `MuiButton`. This
 * only exercises that one control's rendered size — NavBar takes a travel
 * object, a heading and several callbacks that have nothing to do with the
 * bug, so a full render of the whole bar would mostly be prop plumbing.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '@mui/material'
import { NavBar } from '../NavBar'
import { playaTheme } from '../theme'

const travel = { meters: 300, feet: 984, miles: 0.19, walkMinutes: 4.3, bikeMinutes: 1.6 }

function renderDenied() {
  render(
    <ThemeProvider theme={playaTheme('dark')}>
      <NavBar
        name="Center Camp"
        travel={travel}
        heading="6:00"
        located={false}
        status="denied"
        onRetryLocation={vi.fn()}
        onClear={vi.fn()}
      />
    </ThemeProvider>,
  )
}

/** theme.ts's TOUCH floor applies below the `md` breakpoint (900px by default). */
function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  window.dispatchEvent(new Event('resize'))
}

describe('NavBar retry-location control', () => {
  afterEach(() => {
    cleanup()
    setViewportWidth(1024)
  })

  it('is a real button, not a bare styled span, so it takes native focus/keyboard behaviour', () => {
    renderDenied()
    const retry = screen.getByRole('button', { name: 'Retry device location' })
    expect(retry.tagName).toBe('BUTTON')
  })

  /**
   * jsdom does not evaluate `@media` conditions when resolving computed
   * style (there is no real viewport to match against), so a live
   * `getComputedStyle().minHeight` check can't distinguish mobile from
   * desktop here the way it would in a browser. What can be checked in
   * jsdom is the mechanism itself: this control is a genuine `MuiButton`,
   * so it carries the class `MuiButton-root`, and theme.ts's stylesheet
   * emits a rule for that exact class, scoped to the exact same
   * `theme.breakpoints.down('md')` media query every other control in the
   * app uses, setting `min-height: 44px`. That is the actual fix — not a
   * one-off style local to NavBar — and it is what a real browser (and
   * the Playwright-driven a11y/smoke scripts) will apply at a mobile
   * viewport.
   */
  it('is a genuine MuiButton, so it inherits the theme\'s 44px mobile touch floor', () => {
    renderDenied()
    const retry = screen.getByRole('button', { name: 'Retry device location' })
    expect(retry.classList.contains('MuiButton-root')).toBe(true)

    const theme = playaTheme('dark')
    const mediaQuery = theme.breakpoints.down('md')
    const ownClass = Array.from(retry.classList).find((c) => c.startsWith('css-'))
    expect(ownClass).toBeDefined()

    const styleText = Array.from(document.querySelectorAll('style'))
      .map((s) => s.textContent ?? '')
      .join('\n')
    const mediaBlock = styleText
      .split('@media')
      .find((block) => block.includes(mediaQuery.replace('@media ', '')) && block.includes(ownClass!))

    expect(mediaBlock).toBeDefined()
    expect(mediaBlock).toMatch(/min-height:\s*44px/)
  })
})
