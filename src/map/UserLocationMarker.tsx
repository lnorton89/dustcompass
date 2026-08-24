import { Box } from '@mui/material'
import { Marker } from '@vis.gl/react-maplibre'
import type { Position } from '../brc/geo'
import type { PlayaPalette } from './style'

interface Props {
  position: Position
  /** Meters. Shown in the marker's label so "current location" carries how sure that claim is. */
  accuracy?: number
  palette: PlayaPalette
  /** Reads out the current playa address on tap (#62). Omit to render a plain, non-interactive dot. */
  onClick?: () => void
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
 *
 * #62: tapping it is also the app's "where am I?" — the survey has unusually
 * strong reverse-geocoder math already, and this is the most discoverable
 * place to surface it: the exact dot the reader is asking about.
 */
export function UserLocationMarker({ position, accuracy, palette, onClick }: Props) {
  const label =
    accuracy !== undefined
      ? `Your location, accurate to about ${Math.round(accuracy)}m`
      : 'Your location'

  const dot = (
    <Box
      aria-hidden={Boolean(onClick)}
      sx={{
        position: 'relative',
        width: 24,
        height: 24,
        pointerEvents: onClick ? 'none' : 'auto',
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
  )

  return (
    <Marker longitude={position[0]} latitude={position[1]} anchor="center" style={{ zIndex: 9 }}>
      {onClick ? (
        // The app's 44x44 mobile touch-target floor — this is raw HTML
        // inside a MapLibre marker, not a MUI component, so none of the
        // theme's IconButton sizing rules reach it (same reasoning as the
        // dropped-pin marker, #57). The 24px dot stays centred inside it.
        <button
          type="button"
          onClick={onClick}
          title={label}
          aria-label={`${label}. Tap for your current playa address.`}
          data-testid="user-location-marker"
          style={{
            width: 44,
            height: 44,
            padding: 0,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {dot}
        </button>
      ) : (
        <Box role="img" aria-label={label} title={label} data-testid="user-location-marker">
          {dot}
        </Box>
      )}
    </Marker>
  )
}
