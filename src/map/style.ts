import type { StyleSpecification } from 'maplibre-gl'

export type ThemeMode = 'dark' | 'light' | 'night'

export interface PlayaPalette {
  playa: string
  /** The drawn desert under the city — see src/brc/playa.ts. */
  basin: string
  patchPale: string
  patchShade: string
  range: string
  street: string
  streetCasing: string
  plaza: string
  fence: string
  /** The gate road's crossing point — distinct from ordinary streets, so it doesn't read as one. */
  entranceRoad: string
  label: string
  labelHalo: string
  art: string
  camp: string
  toilet: string
  medical: string
  ranger: string
  civic: string
  /** The Temple and other named deep-playa reference points — see ServiceCategory's 'landmark'. */
  landmark: string
  saved: string
  /** The live current-location marker (#59) — deliberately not `saved`'s colour, which already means something else on the same map. */
  location: string
}

export const DARK: PlayaPalette = {
  playa: '#12100e',
  basin: '#241f17',
  patchPale: '#2d2619',
  patchShade: '#1d1913',
  range: '#0b0908',
  street: '#625b50',
  streetCasing: '#302c27',
  plaza: '#39342d',
  fence: '#9a8055',
  entranceRoad: '#d9a44a',
  label: '#e8e0d0',
  labelHalo: '#12100e',
  art: '#ff8a4c',
  camp: '#5ec8d8',
  toilet: '#8b9dc3',
  medical: '#ef4444',
  ranger: '#22c55e',
  civic: '#cbb994',
  landmark: '#a78bfa',
  saved: '#facc15',
  location: '#38bdf8',
}

/**
 * Red preserves night vision, which is why red headlamps are the convention out
 * here. Everything is a single hue at low luminance so the screen stops being a
 * flashlight pointed at your own eyes — and at everyone standing near you.
 */
export const NIGHT: PlayaPalette = {
  playa: '#0a0000',
  basin: '#150404',
  patchPale: '#1c0707',
  patchShade: '#100202',
  range: '#060000',
  street: '#5c1212',
  streetCasing: '#1f0505',
  plaza: '#2a0808',
  fence: '#7a2020',
  entranceRoad: '#b34747',
  label: '#ff6b6b',
  labelHalo: '#0a0000',
  art: '#ff4d4d',
  camp: '#c94040',
  toilet: '#8f3030',
  medical: '#ff8080',
  ranger: '#d95555',
  civic: '#a03535',
  // Its own shade of the same night-mode red, not a different hue — see the
  // file comment above on why every colour here stays on one low-luminance red.
  landmark: '#cc6666',
  // The most saturated red in the palette: this is a live, moving indicator
  // rather than static chrome, and it needs to read as "you" at a glance
  // among everything else that stays on the same hue.
  saved: '#ff9b9b',
  location: '#ff3b3b',
}

export const LIGHT: PlayaPalette = {
  playa: '#e8e0cf',
  basin: '#ded4bf',
  patchPale: '#eae2d1',
  patchShade: '#d2c6ad',
  range: '#b3a184',
  street: '#ffffff',
  streetCasing: '#c9bda2',
  plaza: '#f2ecdd',
  fence: '#9a7f4e',
  entranceRoad: '#a8722a',
  label: '#3a332a',
  labelHalo: '#f5f0e4',
  art: '#c2410c',
  camp: '#0e7490',
  toilet: '#4c5c80',
  medical: '#b91c1c',
  ranger: '#15803d',
  civic: '#7a6a45',
  landmark: '#6d28d9',
  saved: '#a16207',
  location: '#0284c7',
}

/**
 * The base style carries only the playa surface. Everything else is added as
 * React <Source>/<Layer> children, so the city can be regenerated at runtime
 * without rebuilding a style document.
 *
 * There is no tile source here on purpose: the city is generated locally and
 * glyphs are bundled, so the map renders with the network switched off.
 */
export function paletteFor(mode: ThemeMode): PlayaPalette {
  if (mode === 'light') return LIGHT
  return mode === 'night' ? NIGHT : DARK
}

export function baseStyle(palette: PlayaPalette, glyphs: string): StyleSpecification {
  return {
    version: 8,
    name: 'Playa',
    glyphs,
    sources: {},
    layers: [{ id: 'playa', type: 'background', paint: { 'background-color': palette.playa } }],
  }
}

/**
 * How much larger the map's labels are drawn when the reader has asked for
 * bigger text. The map is read at arm's length, in daylight, through dust on
 * the glass, and often by someone who did not bring their glasses to the
 * desert — and unlike the interface, the labels have room to grow into.
 */
export const LABEL_SCALE = { normal: 1, large: 1.25 } as const
export type ReadingSize = keyof typeof LABEL_SCALE

/** One label size, scaled. Kept to a tenth of a pixel; MapLibre accepts it. */
export const labelSize = (scale: number, size: number) => Math.round(size * scale * 10) / 10

/**
 * A label that grows with zoom, scaled. Only the sizes move — the zoom stops
 * are where a label starts earning its space and have nothing to do with how
 * big it is drawn.
 *
 * Cast because MapLibre's own layout types take a number here, while accepting
 * an expression at runtime; the same cast the layers already use inline.
 */
export const labelRamp = (scale: number, stops: readonly (readonly [number, number])[]) =>
  [
    'interpolate',
    ['linear'],
    ['zoom'],
    ...stops.flatMap(([zoom, size]) => [zoom, labelSize(scale, size)]),
  ] as unknown as number
