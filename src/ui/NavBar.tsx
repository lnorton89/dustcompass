import { Box, Button, IconButton, Paper, Stack, Tooltip, Typography } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk'
import DirectionsBikeIcon from '@mui/icons-material/DirectionsBike'
import NearMeIcon from '@mui/icons-material/NearMe'
import VisibilityIcon from '@mui/icons-material/Visibility'
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
  /** True while a Screen Wake Lock is actually held for this navigation (#65) — not merely supported. */
  screenAwake?: boolean
  onRetryLocation: () => void
  onClear: () => void
}

/**
 * Stays on screen while you walk. Distance and time are the useful part, but
 * the heading is given as a clock position because that is the vocabulary the
 * city is built in — "head toward 4:30" is something you can act on without
 * looking at the screen again.
 */
export function NavBar({ name, address, travel, heading, located, status, accuracy, approximate, screenAwake, onRetryLocation, onClear }: Props) {
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
            <DirectionsWalkIcon fontSize="inherit" />
            <Typography variant="body2">{formatMinutes(travel.walkMinutes)}</Typography>
          </Stack>
          <Stack direction="row" spacing={0.4} sx={{ alignItems: 'center' }}>
            <DirectionsBikeIcon fontSize="inherit" />
            <Typography variant="body2">{formatMinutes(travel.bikeMinutes)}</Typography>
          </Stack>
          {located ? (
            // "Head toward 4:30" is the one instruction you can follow without
            // looking at the screen again, which is the whole reason the heading
            // is given as a clock position. It should not be the quietest thing
            // in the row.
            <Typography
              variant="body2"
              noWrap
              sx={{ fontWeight: 700, color: 'primary.main' }}
            >
              toward {heading}
            </Typography>
          ) : (
            <Typography variant="body2" noWrap>
              {status === 'locating'
                ? 'finding you…'
                : status === 'denied'
                  ? `${address ?? heading} · from the Man (location off)`
                  : `${address ?? heading} · from the Man`}
            </Typography>
          )}
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
      <IconButton onClick={onClear} size="small" aria-label="Stop navigating">
        <CloseIcon fontSize="small" />
      </IconButton>
    </Paper>
  )
}
