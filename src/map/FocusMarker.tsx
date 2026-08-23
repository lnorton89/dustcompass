import { Box, Typography } from '@mui/material'
import { Marker } from '@vis.gl/react-maplibre'
import type { Position } from '../brc/geo'

interface Props {
  position: Position
  name: string
  navigating?: boolean
}

/** A high-contrast, labeled target that remains legible over every map theme. */
export function FocusMarker({ position, name, navigating = false }: Props) {
  const color = navigating ? '#5ec8d8' : '#ff8a4c'
  const label = navigating ? `Navigation destination: ${name}` : `Selected location: ${name}`

  return (
    <Marker longitude={position[0]} latitude={position[1]} anchor="center">
      <Box
        role="img"
        aria-label={label}
        data-testid={navigating ? 'navigation-target' : 'selection-target'}
        sx={{
          position: 'relative',
          width: 48,
          height: 48,
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
            inset: 3,
            border: `3px solid ${color}`,
            borderRadius: '50%',
            boxShadow: '0 2px 10px rgba(0,0,0,.8), inset 0 0 0 2px #12100e',
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            inset: 3,
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
            border: '2px solid #12100e',
            borderRadius: '50%',
          }}
        />
        <Typography
          component="span"
          sx={{
            position: 'absolute',
            top: 49,
            left: '50%',
            transform: 'translateX(-50%)',
            maxWidth: 220,
            px: 1,
            py: 0.35,
            bgcolor: 'rgba(18,16,14,.94)',
            color: '#fff7e8',
            border: `1px solid ${color}`,
            borderRadius: 1,
            fontSize: 12,
            fontWeight: 700,
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            boxShadow: '0 2px 8px rgba(0,0,0,.65)',
          }}
        >
          {navigating ? 'GO TO · ' : ''}{name}
        </Typography>
      </Box>
    </Marker>
  )
}
