import type { StyleSpecification } from 'maplibre-gl'

export type ThemeMode = 'dark' | 'light' | 'night'

export interface PlayaPalette {
  playa: string
  /** The drawn desert under the city — see src/brc/playa.ts. */
  basin: string
  patchPale: string
  patchShade: string
  track: string
  range: string
  street: string
  streetCasing: string
  plaza: string
  fence: string
  label: string
  labelHalo: string
  art: string
  camp: string
  toilet: string
  medical: string
  ranger: string
  civic: string
  saved: string
}

export const DARK: PlayaPalette = {
  playa: '#12100e',
  basin: '#241f17',
  patchPale: '#2d2619',
  patchShade: '#1d1913',
  track: '#3a3226',
  range: '#0b0908',
  street: '#625b50',
  streetCasing: '#302c27',
  plaza: '#39342d',
  fence: '#9a8055',
  label: '#e8e0d0',
  labelHalo: '#12100e',
  art: '#ff8a4c',
  camp: '#5ec8d8',
  toilet: '#8b9dc3',
  medical: '#ef4444',
  ranger: '#22c55e',
  civic: '#cbb994',
  saved: '#facc15',
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
  track: '#230909',
  range: '#060000',
  street: '#5c1212',
  streetCasing: '#1f0505',
  plaza: '#2a0808',
  fence: '#7a2020',
  label: '#ff6b6b',
  labelHalo: '#0a0000',
  art: '#ff4d4d',
  camp: '#c94040',
  toilet: '#8f3030',
  medical: '#ff8080',
  ranger: '#d95555',
  civic: '#a03535',
  saved: '#ff9b9b',
}

export const LIGHT: PlayaPalette = {
  playa: '#e8e0cf',
  basin: '#ded4bf',
  patchPale: '#eae2d1',
  patchShade: '#d2c6ad',
  track: '#c6b99d',
  range: '#b3a184',
  street: '#ffffff',
  streetCasing: '#c9bda2',
  plaza: '#f2ecdd',
  fence: '#9a7f4e',
  label: '#3a332a',
  labelHalo: '#f5f0e4',
  art: '#c2410c',
  camp: '#0e7490',
  toilet: '#4c5c80',
  medical: '#b91c1c',
  ranger: '#15803d',
  civic: '#7a6a45',
  saved: '#a16207',
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
