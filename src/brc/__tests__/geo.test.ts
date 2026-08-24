import { describe, expect, it } from 'vitest'
import { bearingsMatch } from '../geo'

describe('bearingsMatch (#14)', () => {
  it('treats identical bearings as matching', () => {
    expect(bearingsMatch(45, 45)).toBe(true)
  })

  it('treats bearings within tolerance as matching', () => {
    expect(bearingsMatch(45, 46)).toBe(true)
    expect(bearingsMatch(46, 45)).toBe(true)
  })

  it('treats bearings outside tolerance as not matching', () => {
    expect(bearingsMatch(45, 50)).toBe(false)
  })

  it('handles wraparound at 0/360 instead of reporting a huge gap', () => {
    expect(bearingsMatch(359.5, 0.5)).toBe(true)
    expect(bearingsMatch(0, 360)).toBe(true)
  })

  it('does not fold a genuinely opposite bearing into a match near the seam', () => {
    expect(bearingsMatch(359, 180)).toBe(false)
  })

  it('honors a custom tolerance', () => {
    expect(bearingsMatch(0, 10, 5)).toBe(false)
    expect(bearingsMatch(0, 10, 15)).toBe(true)
  })
})
