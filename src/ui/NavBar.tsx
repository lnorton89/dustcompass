import { Box, Button, IconButton, Paper, Stack, Typography } from '@mui/material'
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
      }}
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
            // The travel icons take their size from here, so the row moves with
            // the type scale rather than being pinned to a raw pixel value.
            fontSize: (theme) => theme.typography.caption.fontSize,
          }}
        >
          <Typography variant="caption">{formatDistance(travel)}</Typography>
          <Stack direction="row" spacing={0.4} sx={{ alignItems: 'center' }}>
            <DirectionsWalkIcon fontSize="inherit" />
            <Typography variant="caption">{formatMinutes(travel.walkMinutes)}</Typography>
          </Stack>
          <Stack direction="row" spacing={0.4} sx={{ alignItems: 'center' }}>
            <DirectionsBikeIcon fontSize="inherit" />
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
      <IconButton onClick={onClear} size="small" aria-label="Stop navigating">
        <CloseIcon fontSize="small" />
      </IconButton>
    </Paper>
  )
}
