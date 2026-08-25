import { describe, expect, it } from 'vitest'
import { formatMinutes } from '../travel'

describe('formatMinutes hour-boundary rounding', () => {
  it.each([
    [59.4, '59 min'],
    [59.5, '1h'],
    [59.6, '1h'],
    [60, '1h'],
    [75, '1h 15m'],
    [119.4, '1h 59m'],
    [119.5, '2h'],
    [119.6, '2h'],
    [120, '2h'],
  ])('formats %s minutes as %s', (minutes, expected) => {
    expect(formatMinutes(minutes)).toBe(expected)
  })

  it('never emits a 60-minute remainder', () => {
    for (let minutes = 0; minutes < 24 * 60; minutes += 0.1) {
      expect(formatMinutes(minutes)).not.toMatch(/\b60m\b/)
    }
  })
})
