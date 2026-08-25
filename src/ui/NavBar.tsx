import { useState } from 'react'
import { Box, Button, IconButton, Paper, Stack, Tooltip, Typography } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk'
import DirectionsBikeIcon from '@mui/icons-material/DirectionsBike'
import ExploreIcon from '@mui/icons-material/Explore'
import NearMeIcon from '@mui/icons-material/NearMe'
import VisibilityIcon from '@mui/icons-material/Visibility'
import { formatDistance, formatMinutes, type Travel } from '../brc/travel'
import { needleAngle } from '../brc/geo'
import type { CompassHeading } from '../data/useCompassHeading'
import type { PlayaPalette } from '../map/style'
import type { PlayaRoute } from '../brc/routing'
import type { DirectionsMode } from '../data/directions'
import { CompassNeedle } from './CompassNeedle'

interface Props {
  name: string
  address?: string
  travel: Travel
  /** Clock direction to head in, e.g. "4:30" — how directions are given here. */
  heading: string
  /** True when measured from a real GPS fix rather than the Man. */
  located: boolean
  status: 'idle' | 'locating' | 'tracking' | 'denied' | 'unavailable'
  accuracy?: number
  approximate?: boolean
  /** True while a Screen Wake Lock is actually held for this navigation (#65) — not merely supported. */
  screenAwake?: boolean
  onRetryLocation: () => void
  onClear: () => void
  /** Target bearing in degrees — the same value `heading`'s clock position is
   * derived from (`bearingBetween`/`bearingToClock`, src/brc/geo.ts). Needed
   * alongside `compass` to point the needle; omit either and the strip falls
   * back to today's text-only navigation, unchanged. */
  bearing?: number
  /** Device-orientation state from `useCompassHeading` (#63). This is a
   * physical compass sensor, not the map's own bearing/orientation controls
   * — the two are unrelated and this never touches the map camera. */
  compass?: CompassHeading
  palette?: PlayaPalette
  fromLabel?: string
  mode?: DirectionsMode
  routeKind?: PlayaRoute['kind']
  liveOrigin?: boolean
  onEdit?: () => void
  onShowRoute?: () => void
}

/**
 * Stays on screen while you walk. Distance and time are the useful part, but
 * the heading is given as a clock position because that is the vocabulary the
 * city is built in — "head toward 4:30" is something you can act on without
 * looking at the screen again.
 */
export function NavBar({
  name,
  address,
  travel,
  heading,
  located,
  status,
  accuracy,
  approximate,
  screenAwake,
  onRetryLocation,
  onClear,
  bearing,
  compass,
  palette,
  fromLabel,
  mode = 'walk',
  routeKind = 'direct',
  liveOrigin = true,
  onEdit,
  onShowRoute,
}: Props) {
  // Dismissing the denial note is purely local UI state — it says nothing
  // about the sensor itself, so it does not live in useCompassHeading.
  const [deniedNoteDismissed, setDeniedNoteDismissed] = useState(false)
  const showCompassControl = compass && palette && compass.support !== 'unsupported'
  const showNeedle =
    compass?.support === 'active' && palette && bearing != null && compass.heading != null
  const showTurnOn = compass?.support === 'idle' || compass?.support === 'needs-permission'
  const showDeniedNote = compass?.support === 'denied' && !deniedNoteDismissed

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'absolute',
        // It sits over the map at the bottom of the screen, which on a phone
        // is where the home indicator is and where the corners curve away.
        left: 'calc(8px + var(--safe-left))',
        right: 'calc(8px + var(--safe-right))',
        bottom: 'calc(8px + var(--safe-bottom))',
        p: { xs: 1, sm: 1.5 },
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 0.75, sm: 1.5 },
        maxWidth: { sm: 520 },
        mx: { sm: 'auto' },
        // Foreground navigation chrome must stay above MapLibre markers and
        // labels. FocusMarker deliberately has its own map-local z-index;
        // without an app-level stack here its destination card can paint over
        // the distance/heading strip on a phone (#129).
        zIndex: (theme) => theme.zIndex.appBar + 1,
      }}
      data-testid="navigation-bar"
    >
      <NearMeIcon color="primary" />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="subtitle2" sx={{ lineHeight: 1.2 }}>
          Heading to {name}
        </Typography>
        {/*
         * This is the screen you read while walking, at arm's length, in
         * daylight, and it was set entirely in 13px caption — the distance, the
         * times and the clock heading all at footnote size. The two things you
         * actually act on are how far it is and which way to go, so those come
         * up to body size and the heading takes the accent; the travel times
         * stay a step below; the accuracy and the caveats stay footnotes,
         * because that is what they are.
         */}
        <Stack
          direction="row"
          spacing={1.25}
          sx={{
            alignItems: 'center',
            color: 'text.secondary',
            flexWrap: 'wrap',
            rowGap: 0.25,
            // The travel icons take their size from here, so the row moves with
            // the type scale rather than being pinned to a raw pixel value.
            fontSize: (theme) => theme.typography.body2.fontSize,
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>
            {formatDistance(travel)}
          </Typography>
          <Stack direction="row" spacing={0.4} sx={{ alignItems: 'center' }}>
            {mode === 'walk' ? <DirectionsWalkIcon fontSize="inherit" /> : <DirectionsBikeIcon fontSize="inherit" />}
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {formatMinutes(mode === 'walk' ? travel.walkMinutes : travel.bikeMinutes)}
            </Typography>
          </Stack>
          <Typography variant="body2" noWrap sx={{ fontWeight: 700, color: 'primary.main' }}>
            toward {heading}
          </Typography>
        </Stack>
        {fromLabel && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2, mt: 0.25 }}>
            From {fromLabel}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2, mt: 0.25 }}>
          {routeKind === 'street'
            ? 'Surveyed street route around occupied blocks'
            : routeKind === 'hybrid'
              ? 'Surveyed streets plus a direct open-playa leg'
              : 'Straight-line estimate — verify a walkable path around occupied blocks'}
        </Typography>
        {(onEdit || onShowRoute) && (
          <Stack direction="row" spacing={0.5} sx={{ mt: 0.25 }}>
            {onEdit && <Button size="small" variant="text" onClick={onEdit}>Edit route</Button>}
            {onShowRoute && <Button size="small" variant="text" onClick={onShowRoute}>Show full route</Button>}
          </Stack>
        )}
        {approximate && (
          <Typography variant="caption" color="warning.main" sx={{ display: 'block', lineHeight: 1.2, mt: 0.25 }}>
            Approximate address area — nearby camps may share this pin
          </Typography>
        )}
        {liveOrigin && located && accuracy != null && (
          <Typography variant="caption" color="text.secondary">
            GPS accuracy ±{Math.round(accuracy)} m
          </Typography>
        )}
        {showDeniedNote && (
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mt: 0.25 }}>
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>
              Compass permission denied — heading and distance above still update as you walk.
            </Typography>
            <IconButton
              onClick={() => setDeniedNoteDismissed(true)}
              size="small"
              aria-label="Dismiss compass permission note"
              sx={{ p: 0.25 }}
            >
              <CloseIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Stack>
        )}
        {liveOrigin && (status === 'denied' || status === 'unavailable') && (
          // A real MuiButton rather than a bare `<Typography component="button">`
          // so it picks up theme.ts's 44px touch floor (MuiButton styleOverrides,
          // below `md`) the same way every other control in the app does, instead
          // of needing its own copy of that breakpoint rule. The sx below only
          // undoes Button's own padding/typography so it still reads as the small
          // underlined caption link this was before, not a filled button — the
          // extra hit area is invisible, via negative margin absorbing the padding
          // that creates it.
          <Button
            onClick={onRetryLocation}
            type="button"
            variant="text"
            disableRipple
            sx={{
              alignSelf: 'flex-start',
              minWidth: 0,
              py: 0,
              px: 0.75,
              mx: -0.75,
              fontSize: (theme) => theme.typography.caption.fontSize,
              fontWeight: 400,
              textDecoration: 'underline',
              color: 'primary.main',
              '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' },
            }}
          >
            Retry device location
          </Button>
        )}
      </Box>
      {/*
       * The only feedback that this is holding the screen open at all —
       * otherwise the reason the phone never dims mid-route is invisible.
       * Shown only while a lock is actually held, not merely supported: a
       * refused/unsupported request keeps navigation working exactly as it
       * did before this existed, silently.
       */}
      {screenAwake && (
        <Tooltip title="Keeping the screen on while you navigate">
          <VisibilityIcon
            fontSize="small"
            aria-label="Screen staying on during navigation"
            sx={{ color: 'text.secondary', flexShrink: 0 }}
          />
        </Tooltip>
      )}
      {showCompassControl && compass && palette && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
          {showNeedle && bearing != null && compass.heading != null ? (
            <CompassNeedle angle={needleAngle(bearing, compass.heading)} accuracy={compass.accuracy} palette={palette} />
          ) : (
            showTurnOn && (
              // A real tap target, not automatic — iOS requires
              // `requestPermission()` to run inside this exact click handler,
              // and other platforms get the same explicit "turn it on"
              // affordance rather than a silent listener nobody asked for.
              <Button
                onClick={() => void compass.requestPermission()}
                type="button"
                size="small"
                startIcon={<ExploreIcon fontSize="small" />}
                sx={{
                  minWidth: 0,
                  px: 1,
                  py: 0.25,
                  fontSize: (theme) => theme.typography.caption.fontSize,
                  whiteSpace: 'nowrap',
                }}
              >
                Compass
              </Button>
            )
          )}
        </Box>
      )}
      <IconButton onClick={onClear} size="small" aria-label="Stop navigating">
        <CloseIcon fontSize="small" />
      </IconButton>
    </Paper>
  )
}
