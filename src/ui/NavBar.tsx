import { Box, IconButton, Paper, Stack, Typography } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk'
import DirectionsBikeIcon from '@mui/icons-material/DirectionsBike'
import NearMeIcon from '@mui/icons-material/NearMe'
import { formatDistance, formatMinutes, type Travel } from '../brc/travel'

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
  onRetryLocation: () => void
  onClear: () => void
}

/**
 * Stays on screen while you walk. Distance and time are the useful part, but
 * the heading is given as a clock position because that is the vocabulary the
 * city is built in — "head toward 4:30" is something you can act on without
 * looking at the screen again.
 */
export function NavBar({ name, address, travel, heading, located, status, accuracy, approximate, onRetryLocation, onClear }: Props) {
  return (
    <Paper
      elevation={8}
      sx={{
        position: 'absolute',
        left: 8,
        right: 8,
        bottom: 8,
        p: { xs: 1, sm: 1.5 },
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 0.75, sm: 1.5 },
        maxWidth: { sm: 520 },
        mx: { sm: 'auto' },
      }}
    >
      <NearMeIcon color="primary" />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="subtitle2" sx={{ lineHeight: 1.2 }}>
          Heading to {name}
        </Typography>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', color: 'text.secondary', flexWrap: 'wrap', rowGap: 0.25 }}>
          <Typography variant="caption">{formatDistance(travel)}</Typography>
          <Stack direction="row" spacing={0.4} sx={{ alignItems: 'center' }}>
            <DirectionsWalkIcon sx={{ fontSize: 15 }} />
            <Typography variant="caption">{formatMinutes(travel.walkMinutes)}</Typography>
          </Stack>
          <Stack direction="row" spacing={0.4} sx={{ alignItems: 'center' }}>
            <DirectionsBikeIcon sx={{ fontSize: 15 }} />
            <Typography variant="caption">{formatMinutes(travel.bikeMinutes)}</Typography>
          </Stack>
          <Typography variant="caption" noWrap>
            {located
              ? `toward ${heading}`
              : status === 'locating'
                ? 'finding you…'
                : status === 'denied'
                  ? `${address ?? heading} · from the Man (location off)`
                  : `${address ?? heading} · from the Man`}
          </Typography>
        </Stack>
        {approximate && (
          <Typography variant="caption" color="warning.main" sx={{ display: 'block', lineHeight: 1.2, mt: 0.25 }}>
            Approximate address area — nearby camps may share this pin
          </Typography>
        )}
        {located && accuracy != null && (
          <Typography variant="caption" color="text.secondary">
            GPS accuracy ±{Math.round(accuracy)} m
          </Typography>
        )}
        {(status === 'denied' || status === 'unavailable') && (
          <Typography
            component="button"
            type="button"
            onClick={onRetryLocation}
            sx={{ border: 0, p: 0, bgcolor: 'transparent', color: 'primary.main', cursor: 'pointer', fontSize: 12 }}
          >
            Retry device location
          </Typography>
        )}
      </Box>
      <IconButton onClick={onClear} size="small" aria-label="Stop navigating">
        <CloseIcon fontSize="small" />
      </IconButton>
    </Paper>
  )
}
