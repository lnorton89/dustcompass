import { describe, expect, it } from 'vitest'
import { bearingsMatch, needleAngle } from '../geo'

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

describe('needleAngle (#63)', () => {
  it('handles wraparound: target 2°, device 358° is a 4° turn, not -356°', () => {
    expect(needleAngle(2, 358)).toBeCloseTo(4)
  })

  it('handles wraparound the other way: target 358°, device 2° is a -4° turn, not +356°', () => {
    expect(needleAngle(358, 2)).toBeCloseTo(-4)
  })

  it('is zero when already pointing at the target', () => {
    expect(needleAngle(90, 90)).toBe(0)
    expect(needleAngle(0, 0)).toBe(0)
  })

  it('is positive (a right turn) when the target is clockwise of the device heading', () => {
    expect(needleAngle(100, 90)).toBeCloseTo(10)
  })

  it('is negative (a left turn) when the target is counter-clockwise of the device heading', () => {
    expect(needleAngle(80, 90)).toBeCloseTo(-10)
  })

  it('stays within the documented [-180, 180) range across the full circle', () => {
    for (let target = 0; target < 360; target += 15) {
      for (let device = 0; device < 360; device += 15) {
        const angle = needleAngle(target, device)
        expect(angle).toBeGreaterThanOrEqual(-180)
        expect(angle).toBeLessThan(180)
      }
    }
  })

  it('resolves an exact opposite bearing to -180, not +180', () => {
    expect(needleAngle(180, 0)).toBe(-180)
    expect(needleAngle(0, 180)).toBe(-180)
  })
})
