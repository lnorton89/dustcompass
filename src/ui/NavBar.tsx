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
  heading: string
  located: boolean
  status: 'idle' | 'locating' | 'tracking' | 'denied' | 'unavailable'
  accuracy?: number
  approximate?: boolean
  published?: boolean
  screenAwake?: boolean
  onRetryLocation: () => void
  onClear: () => void
  bearing?: number
  compass?: CompassHeading
  palette?: PlayaPalette
  fromLabel?: string
  mode?: DirectionsMode
  routeKind?: PlayaRoute['kind']
  liveOrigin?: boolean
  /** True when this fixed Man-origin route came from a failed live-origin attempt. */
  retryableOrigin?: boolean
  onEdit?: () => void
  onShowRoute?: () => void
}

export function NavBar({
  name,
  travel,
  heading,
  located,
  status,
  accuracy,
  approximate,
  published,
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
  retryableOrigin = liveOrigin,
  onEdit,
  onShowRoute,
}: Props) {
  const [deniedNoteDismissed, setDeniedNoteDismissed] = useState(false)
  const showCompassControl = compass && palette && compass.support !== 'unsupported'
  const showNeedle = compass?.support === 'active' && palette && bearing != null && compass.heading != null
  const showTurnOn = compass?.support === 'idle' || compass?.support === 'needs-permission'
  const showDeniedNote = compass?.support === 'denied' && !deniedNoteDismissed
  const showRetryLocation = retryableOrigin && !located && status !== 'locating' && status !== 'tracking'

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'absolute',
        left: 'calc(8px + var(--safe-left))',
        right: 'calc(8px + var(--safe-right))',
        bottom: 'calc(8px + var(--safe-bottom))',
        p: { xs: 1, sm: 1.5 },
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 0.75, sm: 1.5 },
        maxWidth: { sm: 520 },
        mx: { sm: 'auto' },
        zIndex: (theme) => theme.zIndex.appBar + 1,
      }}
      data-testid="navigation-bar"
    >
      <NearMeIcon color="primary" />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="subtitle2" sx={{ lineHeight: 1.2 }}>
          Heading to {name}
        </Typography>
        <Stack
          direction="row"
          spacing={1.25}
          sx={{
            alignItems: 'center',
            color: 'text.secondary',
            flexWrap: 'wrap',
            rowGap: 0.25,
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
        {published && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2, mt: 0.25 }}>
            Officially published location — not surveyed. Camps and art can move after publication.
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
        {showRetryLocation && (
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
