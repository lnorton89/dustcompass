import { describe, expect, it } from 'vitest'
import { createPropertyExpression, latest, type Color } from '@maplibre/maplibre-gl-style-spec'
import { clusterColor } from '../PoiLayers'
import { DARK, LIGHT, NIGHT, type PlayaPalette } from '../style'

/**
 * Evaluates the real `circle-color` expression the way MapLibre would, given
 * a cluster's aggregated `artCount`/`point_count` properties — the same
 * properties `clusterProperties` on the <Source> populates at runtime. This
 * is the closest thing to a browser render this repo's node-only test setup
 * can do, and it exercises the actual expression rather than a stand-in.
 */
function evaluateClusterColor(palette: PlayaPalette, artCount: number, pointCount: number): string {
  const propertySpec = latest.paint_circle['circle-color']
  const result = createPropertyExpression(clusterColor(palette) as unknown as unknown[], propertySpec)
  if (result.result !== 'success') {
    throw new Error(`bad expression: ${result.value.map((e) => e.message).join(', ')}`)
  }
  const color = result.value.evaluate(
    { zoom: 14 } as never,
    { properties: { artCount, point_count: pointCount } } as never,
  ) as Color
  return toHex(color)
}

function toHex(color: Color): string {
  const channel = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0')
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`
}

/** Mirrors the blend PoiLayers.mixColors computes, kept independent of it. */
function expectedMix(a: string, b: string): string {
  const rgb = (hex: string) =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
  const [ar, ag, ab] = rgb(a)
  const [br, bg, bb] = rgb(b)
  const channel = (x: number, y: number) => Math.round((x + y) / 2).toString(16).padStart(2, '0')
  return `#${channel(ar, br)}${channel(ag, bg)}${channel(ab, bb)}`
}

describe('cluster circle color reflects what is actually inside the cluster', () => {
  const palettes = { DARK, LIGHT, NIGHT }

  for (const [name, palette] of Object.entries(palettes)) {
    describe(name, () => {
      it('colors an all-art cluster with the art legend color', () => {
        expect(evaluateClusterColor(palette, 5, 5)).toBe(palette.art.toLowerCase())
      })

      it('colors an all-camp cluster with the camp legend color', () => {
        expect(evaluateClusterColor(palette, 0, 8)).toBe(palette.camp.toLowerCase())
      })

      it('colors a mixed cluster with a deliberate blend, not the camp default', () => {
        const mixed = evaluateClusterColor(palette, 3, 10)
        expect(mixed).not.toBe(palette.camp.toLowerCase())
        expect(mixed).not.toBe(palette.art.toLowerCase())
        expect(mixed).toBe(expectedMix(palette.art, palette.camp))
      })
    })
  }

  it('a lone-art cluster of one still reads as pure art (artCount equals point_count)', () => {
    expect(evaluateClusterColor(DARK, 1, 1)).toBe(DARK.art.toLowerCase())
  })
})
