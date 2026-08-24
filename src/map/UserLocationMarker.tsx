import { Box } from '@mui/material'
import { Marker } from '@vis.gl/react-maplibre'
import type { Position } from '../brc/geo'
import type { PlayaPalette } from './style'

interface Props {
  position: Position
  /** Meters. Shown in the marker's label so "current location" carries how sure that claim is. */
  accuracy?: number
  palette: PlayaPalette
}

/**
 * #59: MapLibre's own `GeolocateControl` runs in one-shot mode here
 * (`trackUserLocation={false}`) so the app has exactly one high-accuracy GPS
 * watch rather than two independent ones — but that also means MapLibre
 * draws no ongoing location dot of its own. Without this, the route line and
 * distance readout kept updating from the app's shared `useGeolocation()`
 * fix while the map had no marker at all (starting navigation without first
 * pressing locate) or a stale one-shot dot frozen at wherever the button was
 * first pressed (pressing locate, then walking). This renders the same
 * shared fix `App.tsx` already uses for navigation math, so the marker,
 * the route origin, and the distance/heading readout can never disagree.
 */
export function UserLocationMarker({ position, accuracy, palette }: Props) {
  const label =
    accuracy !== undefined
      ? `Your location, accurate to about ${Math.round(accuracy)}m`
      : 'Your location'

  return (
    <Marker longitude={position[0]} latitude={position[1]} anchor="center" style={{ zIndex: 9 }}>
      <Box
        role="img"
        aria-label={label}
        title={label}
        data-testid="user-location-marker"
        sx={{
          position: 'relative',
          width: 24,
          height: 24,
          pointerEvents: 'none',
          '@keyframes user-location-pulse': {
            '0%': { transform: 'scale(.6)', opacity: 0.5 },
            '100%': { transform: 'scale(2)', opacity: 0 },
          },
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            bgcolor: palette.location,
            opacity: 0.35,
            animation: 'user-location-pulse 2.2s ease-out infinite',
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 14,
            height: 14,
            transform: 'translate(-50%, -50%)',
            bgcolor: palette.location,
            border: `2.5px solid ${palette.labelHalo}`,
            borderRadius: '50%',
            boxShadow: '0 1px 4px rgba(0,0,0,.6)',
          }}
        />
      </Box>
    </Marker>
  )
}
