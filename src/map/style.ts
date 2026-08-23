import type { StyleSpecification } from 'maplibre-gl'

export interface PlayaPalette {
  playa: string
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
  street: '#3a352e',
  streetCasing: '#221f1b',
  plaza: '#2a2620',
  fence: '#6b5b3e',
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

export const LIGHT: PlayaPalette = {
  playa: '#e8e0cf',
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
export function baseStyle(palette: PlayaPalette, glyphs: string): StyleSpecification {
  return {
    version: 8,
    name: 'Playa',
    glyphs,
    sources: {},
    layers: [{ id: 'playa', type: 'background', paint: { 'background-color': palette.playa } }],
  }
}
