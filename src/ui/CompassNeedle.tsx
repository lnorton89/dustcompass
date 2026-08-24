import { Box } from '@mui/material'
import type { PlayaPalette } from '../map/style'

interface Props {
  /** From `needleAngle()` in src/brc/geo.ts — degrees in `[-180, 180)`,
   * signed from straight ahead of the device to the destination. */
  angle: number
  /** Degrees of uncertainty, when the platform reports one. */
  accuracy?: number
  palette: PlayaPalette
}

/**
 * A device-heading compass needle — distinct from the map's own bearing
 * controls (#63). It rotates with the physical phone, via `useCompassHeading`
 * and `needleAngle()`; it never touches the MapLibre camera.
 *
 * Colours come from the active `PlayaPalette`, the same source `FocusMarker`
 * and `UserLocationMarker` draw theirs from, so red night mode never gets a
 * bright, off-hue needle: `camp` already carries its own reduced-luminance
 * red in `NIGHT`.
 */
export function CompassNeedle({ angle, accuracy, palette }: Props) {
  const rounded = Math.round(angle)
  const label = `Compass: turn ${
    rounded === 0 ? 'straight ahead' : `${Math.abs(rounded)}° ${rounded > 0 ? 'right' : 'left'}`
  } toward the destination${accuracy != null ? `, accuracy ±${Math.round(accuracy)}°` : ''}`

  return (
    <Box
      role="img"
      aria-label={label}
      data-testid="compass-needle"
      sx={{
        width: 40,
        height: 40,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Box
        component="svg"
        viewBox="0 0 24 24"
        data-testid="compass-needle-glyph"
        // The angle changes every orientation event, so it's a plain inline
        // style rather than an `sx` value — an `sx` transform would mint a
        // fresh Emotion class on every reading instead of just updating one
        // style attribute. The transition/reduced-motion rule is static, so
        // that part stays in `sx` alongside every other themed component here.
        style={{ transform: `rotate(${angle}deg)` }}
        sx={{
          width: 30,
          height: 30,
          transition: 'transform 0.25s ease-out',
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        }}
      >
        <circle cx={12} cy={12} r={11} fill="none" stroke={palette.labelHalo} strokeWidth={1} opacity={0.5} />
        <path d="M12 2.5 L16.5 19 L12 15.5 L7.5 19 Z" fill={palette.camp} stroke={palette.labelHalo} strokeWidth={0.6} strokeLinejoin="round" />
      </Box>
    </Box>
  )
}
