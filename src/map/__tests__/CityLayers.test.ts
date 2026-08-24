import { describe, expect, it } from 'vitest'
import { roadWidth } from '../CityLayers'

/**
 * #51: the zoom-only ramp drew a 50 ft K street, a 30 ft annular street, and
 * a 20 ft radial path at the same physical width, even though `city.ts`
 * already carries each feature's own surveyed `width`. `roadWidth()` now
 * multiplies the zoom ramp by that feature's width relative to
 * `baseRoadWidth`.
 *
 * A tiny hand-rolled evaluator, not a full MapLibre style-spec dependency:
 * this only needs to prove the compiled expression actually reads
 * `['get', 'width']` and scales by it, not reproduce MapLibre's own
 * expression engine. Evaluated only at zoom stops the ramp defines exactly
 * (12/16/19), so no interpolation math is needed to get an exact number.
 */
function evaluate(expr: unknown, zoom: number, properties: Record<string, number>): number {
  if (!Array.isArray(expr)) return expr as number
  const [op, ...args] = expr as [string, ...unknown[]]
  switch (op) {
    case '*':
      return args.reduce((total: number, arg) => total * evaluate(arg, zoom, properties), 1)
    case '/':
      return evaluate(args[0], zoom, properties) / evaluate(args[1], zoom, properties)
    case 'get':
      return properties[args[0] as string]
    case 'coalesce':
      for (const arg of args) {
        const value = evaluate(arg, zoom, properties)
        if (value !== undefined && value !== null) return value
      }
      throw new Error('coalesce: every branch was undefined')
    case 'interpolate': {
      const stops = args.slice(2)
      for (let i = 0; i < stops.length; i += 2) {
        if (stops[i] === zoom) return evaluate(stops[i + 1], zoom, properties)
      }
      throw new Error(`no exact stop at zoom ${zoom} — this evaluator does not interpolate`)
    }
    default:
      throw new Error(`unsupported expression op: ${op}`)
  }
}

describe('roadWidth (#51)', () => {
  const BASE = 30

  it('renders a wider surveyed street proportionally wider than the baseline', () => {
    const expr = roadWidth(1, BASE)
    const baseline = evaluate(expr, 16, { width: BASE })
    const kStreet = evaluate(expr, 16, { width: 50 })
    expect(kStreet).toBeCloseTo(baseline * (50 / BASE))
    expect(kStreet).toBeGreaterThan(baseline)
  })

  it('renders a narrower surveyed street (a radial path) proportionally narrower', () => {
    const expr = roadWidth(1, BASE)
    const avenue = evaluate(expr, 16, { width: 40 })
    const path = evaluate(expr, 16, { width: 20 })
    expect(path).toBeCloseTo(avenue * (20 / 40))
    expect(path).toBeLessThan(avenue)
  })

  it('falls back to the baseline width (a 1:1 ratio) when a feature carries no width', () => {
    const expr = roadWidth(1, BASE)
    const baseline = evaluate(expr, 16, { width: BASE })
    const missing = evaluate(expr, 16, {})
    expect(missing).toBeCloseTo(baseline)
  })

  it('keeps the width ratio proportional across zoom levels, not just one', () => {
    const expr = roadWidth(1, BASE)
    const ratioAt = (zoom: number) => evaluate(expr, zoom, { width: 50 }) / evaluate(expr, zoom, { width: BASE })
    expect(ratioAt(12)).toBeCloseTo(50 / BASE)
    expect(ratioAt(19)).toBeCloseTo(50 / BASE)
  })
})
