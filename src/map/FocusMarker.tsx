import { Box, Typography } from '@mui/material'
import { Marker } from '@vis.gl/react-maplibre'
import type { Position } from '../brc/geo'
import type { PlayaPalette } from './style'

interface Props {
  position: Position
  name: string
  address?: string
  navigating?: boolean
  approximate?: boolean
  palette: PlayaPalette
}

/**
 * A high-contrast, labeled target that remains legible over every map theme —
 * including red night mode, where a hard-coded cyan/cream marker would be the
 * one bright, off-hue surface in an interface built entirely around staying
 * off it. Colours come from the active `PlayaPalette` rather than fixed hex,
 * the same source the rest of the map draws its legend from: `camp`'s accent
 * marks the navigation target, `art`'s marks a plain selection, and each
 * already carries its own red intensity in night mode.
 */
export function FocusMarker({
  position,
  name,
  address,
  navigating = false,
  approximate = false,
  palette,
}: Props) {
  const color = navigating ? palette.camp : palette.art
  const label = `${navigating ? 'Navigation destination' : 'Selected location'}: ${name}${address ? `, ${address}` : ''}`

  return (
    <Marker longitude={position[0]} latitude={position[1]} anchor="center" style={{ zIndex: 10 }}>
      <Box
        role="img"
        aria-label={label}
        data-testid={navigating ? 'navigation-target' : 'selection-target'}
        sx={{
          position: 'relative',
          width: 64,
          height: 64,
          pointerEvents: 'none',
          '@keyframes target-pulse': {
            '0%': { transform: 'scale(.65)', opacity: 0.95 },
            '75%, 100%': { transform: 'scale(1.35)', opacity: 0 },
          },
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            inset: 5,
            border: `4px solid ${color}`,
            borderRadius: '50%',
            boxShadow: `0 2px 10px rgba(0,0,0,.8), inset 0 0 0 2px ${palette.labelHalo}`,
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            inset: 5,
            border: `3px solid ${color}`,
            borderRadius: '50%',
            animation: 'target-pulse 1.8s ease-out infinite',
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 12,
            height: 12,
            transform: 'translate(-50%, -50%)',
            bgcolor: color,
            border: `2px solid ${palette.labelHalo}`,
            borderRadius: '50%',
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            top: 65,
            left: '50%',
            transform: 'translateX(-50%)',
            minWidth: navigating ? 190 : 0,
            maxWidth: 240,
            px: navigating ? 1.25 : 1,
            py: navigating ? 0.65 : 0.35,
            bgcolor: palette.labelHalo,
            color: palette.label,
            border: `${navigating ? 2 : 1}px solid ${color}`,
            borderRadius: 1,
            textAlign: 'center',
            boxShadow: '0 3px 12px rgba(0,0,0,.8)',
          }}
        >
          {navigating && (
            <Typography
              component="span"
              sx={{ display: 'block', color, fontSize: 10, fontWeight: 900, letterSpacing: '.12em', lineHeight: 1.1 }}
            >
              {approximate ? 'DESTINATION AREA' : 'DESTINATION'}
            </Typography>
          )}
          <Typography
            component="span"
            sx={{
              maxWidth: 220,
              fontSize: navigating ? 14 : 12,
              fontWeight: 800,
              lineHeight: 1.2,
              whiteSpace: 'normal',
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {name}
          </Typography>
          {navigating && address && (
            <Typography component="span" sx={{ display: 'block', color: palette.label, opacity: 0.75, fontSize: 11, lineHeight: 1.2 }}>
              {address}
            </Typography>
          )}
          {navigating && approximate && (
            <Typography component="span" sx={{ display: 'block', color, fontSize: 10, fontWeight: 700, mt: 0.35 }}>
              Approximate street address
            </Typography>
          )}
        </Box>
      </Box>
    </Marker>
  )
}
