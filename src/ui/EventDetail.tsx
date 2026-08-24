import { useMemo } from 'react'
import {
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import NearMeIcon from '@mui/icons-material/NearMe'
import BookmarkIcon from '@mui/icons-material/Bookmark'
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder'
import type { CityLayout } from '../brc/layout'
import type { Position } from '../brc/geo'
import { formatDistance, travelBetween } from '../brc/travel'
import { PLAYA_TIME_ZONE, resolveEventLocation } from '../data/events'
import type { EventItem, Occurrence, Poi } from '../data/types'

interface Props {
  event: EventItem | undefined
  /** The registered camp/art piece this event belongs to, if any. */
  host?: Poi
  layout: CityLayout
  /** Where to measure from, for a distance readout when a location is known. */
  origin?: Position
  now: Date
  /** Whole-event save state, keyed by `event.uid` — see `useSavedEvents`. */
  isSaved: boolean
  onToggleSave: () => void
  onClose: () => void
  onNavigate: (target: {
    name: string
    position: Position
    address?: string
    positionSource?: 'gps' | 'address'
    uid?: string
  }) => void
}

/**
 * The event itself, not the venue hosting it. `EventsPanel` and a camp/art
 * `DetailDrawer`'s hosted-event rows both open this — an event's own
 * description, full occurrence list, and location context used to be
 * unreachable from either: the list rows only ever navigated to the host
 * (or, for an unregistered host, did nothing at all), and the host detail
 * listed hosted events as plain, noninteractive text (issue #20).
 */
export function EventDetail({
  event,
  host,
  layout,
  origin,
  now,
  isSaved,
  onToggleSave,
  onClose,
  onNavigate,
}: Props) {
  const location = useMemo(
    () => (event ? resolveEventLocation(event, host, layout) : undefined),
    [event, host, layout],
  )
  const position =
    location?.kind === 'host'
      ? location.poi.position
      : location?.kind === 'geocoded'
        ? location.position
        : undefined
  const travel = useMemo(
    () => (origin && position ? travelBetween(origin, position) : undefined),
    [origin, position],
  )

  const description = event?.description || event?.print_description

  return (
    <Dialog open={Boolean(event)} onClose={onClose} fullWidth maxWidth="xs">
      {event && (
        <>
          <DialogTitle sx={{ pr: 11 }}>
            {event.title}
            <Stack direction="row" spacing={0.5} sx={{ position: 'absolute', right: 8, top: 8 }}>
              <IconButton
                onClick={onToggleSave}
                size="small"
                aria-label={isSaved ? 'Remove from saved events' : 'Save this event'}
                color={isSaved ? 'primary' : 'default'}
              >
                {isSaved ? <BookmarkIcon fontSize="small" /> : <BookmarkBorderIcon fontSize="small" />}
              </IconButton>
              <IconButton onClick={onClose} size="small" aria-label="Close event details">
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>
          </DialogTitle>
          <DialogContent>
            {event.event_type && (
              <Chip size="small" variant="outlined" label={event.event_type.label} sx={{ mb: 1.5 }} />
            )}
            <Stack spacing={0.25} sx={{ mb: 2 }}>
              {event.occurrence_set.map((occurrence, index) => (
                <Typography key={index} variant="body2" color="text.secondary">
                  {formatOccurrenceRange(occurrence, now)}
                </Typography>
              ))}
            </Stack>

            <Typography variant="body2" sx={{ mb: 2 }}>
              {location?.kind === 'host'
                ? location.poi.name
                : location?.kind === 'geocoded' || location?.kind === 'unmapped'
                  ? location.label
                  : 'Location not listed.'}
              {location?.kind === 'unmapped' && (
                <Typography component="span" variant="body2" color="text.secondary">
                  {' '}
                  (not mapped)
                </Typography>
              )}
              {travel && (
                <Typography component="span" variant="body2" color="text.secondary">
                  {' '}
                  · {formatDistance(travel)}
                </Typography>
              )}
            </Typography>

            {description ? (
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {description}
              </Typography>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                No description published for this event.
              </Typography>
            )}
          </DialogContent>
          {position && (
            <DialogActions sx={{ px: 3, pb: 2, pt: 0 }}>
              <Button
                variant="contained"
                startIcon={<NearMeIcon />}
                fullWidth
                onClick={() => {
                  if (location?.kind === 'host') {
                    onNavigate(location.poi)
                  } else if (location?.kind === 'geocoded') {
                    onNavigate({
                      name: event.title,
                      position: location.position,
                      address: location.label,
                      positionSource: 'address',
                    })
                  }
                  onClose()
                }}
              >
                Take me there
              </Button>
            </DialogActions>
          )}
        </>
      )}
    </Dialog>
  )
}

function formatOccurrenceRange(occurrence: Occurrence, now: Date): string {
  const start = new Date(occurrence.start_time)
  const end = new Date(occurrence.end_time)
  const day = start.toLocaleString(undefined, {
    timeZone: PLAYA_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  const startTime = start.toLocaleString(undefined, {
    timeZone: PLAYA_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  })
  const endTime = end.toLocaleString(undefined, {
    timeZone: PLAYA_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  })
  const running = start <= now && end > now
  return `${day} · ${startTime}–${endTime}${running ? ' · on now' : ''}`
}
