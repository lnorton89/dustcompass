import { useCallback, useState } from 'react'
import {
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined'
import CloseIcon from '@mui/icons-material/Close'
import StarIcon from '@mui/icons-material/Star'
import StarBorderIcon from '@mui/icons-material/StarBorder'
import IosShareIcon from '@mui/icons-material/IosShare'
import NearMeIcon from '@mui/icons-material/NearMe'
import Button from '@mui/material/Button'
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk'
import DirectionsBikeIcon from '@mui/icons-material/DirectionsBike'
import type { Position } from '../brc/geo'
import { formatDistance, formatMinutes, travelBetween } from '../brc/travel'
import type { EventItem, Poi } from '../data/types'

interface Props {
  poi: Poi | undefined
  events: EventItem[]
  /** Where to measure from — the user's GPS fix, or the Man as a fallback. */
  origin: Position
  originLabel: string
  isFavorite: boolean
  onToggleFavorite: (uid: string) => void
  onShare: (poi: Poi) => void
  onNavigate: (poi: Poi) => void
  onClose: () => void
  /**
   * How much of the map this sheet is covering, reported as it opens so the
   * map can put the chosen place in the part still visible.
   */
  onMeasure?: (height: number) => void
  /** Phone layout: come up from the bottom instead of standing beside the map. */
  compact?: boolean
}

/** The API's own vocabulary, in the app's. */
const KIND_LABEL: Record<Poi['kind'], string> = {
  art: 'Art',
  camp: 'Camp',
  event: 'Event',
  service: 'Service',
  landmark: 'Landmark',
}

export function DetailDrawer({
  poi,
  events,
  origin,
  originLabel,
  isFavorite,
  onToggleFavorite,
  onShare,
  onNavigate,
  onClose,
  onMeasure,
  compact,
}: Props) {
  const travel = poi ? travelBetween(origin, poi.position) : undefined
  const [imageState, setImageState] = useState<{ uid?: string; failed: boolean }>({
    failed: false,
  })

  // A new listing gets a fresh attempt at its image. Adjusting during render
  // rather than in an effect: React re-runs the component before committing, so
  // the stale "failed" state is never painted.
  if (poi && imageState.uid !== poi.uid) setImageState({ uid: poi.uid, failed: false })
  const imageFailed = imageState.failed

  // Measured off the paper itself rather than guessed at a fraction of the
  // window: what is in here decides how tall it is, and a listing with a photo
  // and forty events is not the same sheet as one with an address.
  const measure = useCallback(
    (node: HTMLDivElement | null) => {
      if (node && onMeasure) onMeasure(node.getBoundingClientRect().height)
    },
    [onMeasure],
  )

  const body = poi && (
    <>
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}
      >
        <Box sx={{ minWidth: 0 }}>
          {/* The one thing on this panel worth reading from arm's length. It
              was the same 20px as every other heading in the app. */}
          <Typography variant="h5">{poi.name}</Typography>
          {poi.subtitle && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {poi.subtitle}
            </Typography>
          )}
        </Box>
        <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
          <IconButton onClick={() => onShare(poi)} size="small" aria-label="Share this location">
            <IosShareIcon fontSize="small" />
          </IconButton>
          <IconButton
            onClick={() => onToggleFavorite(poi.uid)}
            size="small"
            aria-label={isFavorite ? 'Remove from favourites' : 'Add to favourites'}
            color={isFavorite ? 'primary' : 'default'}
          >
            {isFavorite ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
          </IconButton>
          <IconButton onClick={onClose} size="small" aria-label="Close details">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', gap: 1 }}>
        <Chip
          size="small"
          label={KIND_LABEL[poi.kind]}
          color={poi.kind === 'art' ? 'primary' : poi.kind === 'camp' ? 'secondary' : 'default'}
        />
        {poi.address && <Chip size="small" variant="outlined" label={poi.address} />}
      </Stack>

      {travel && (
        <Stack
          direction="row"
          spacing={2}
          sx={{ mt: 2, alignItems: 'center', color: 'text.secondary' }}
        >
          <Typography variant="body2">{formatDistance(travel)}</Typography>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <DirectionsWalkIcon fontSize="small" />
            <Typography variant="body2">{formatMinutes(travel.walkMinutes)}</Typography>
          </Stack>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <DirectionsBikeIcon fontSize="small" />
            <Typography variant="body2">{formatMinutes(travel.bikeMinutes)}</Typography>
          </Stack>
        </Stack>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        from {originLabel}
      </Typography>

      <Button
        variant="contained"
        startIcon={<NearMeIcon />}
        onClick={() => onNavigate(poi)}
        sx={{ mt: 2 }}
        fullWidth
      >
        Take me there
      </Button>
      {/*
       * The button used to carry "· address area" as well, so the panel said
       * the same thing twice in three lines — once appended to the label of the
       * thing you press, and once underneath it in full. The caveat is worth
       * making, but it is a caveat about the pin, not about the button, and no
       * listing has surveyed coordinates this year: said twice on every camp
       * the reader opens, it stops being read at all.
       */}
      {poi.positionSource === 'address' && (
        <Typography
          variant="caption"
          color="warning.main"
          sx={{ display: 'block', mt: 0.75, fontWeight: 650 }}
        >
          Approximate pin at {poi.address ?? 'the listed address'}. Nearby camps can share this same
          map point.
        </Typography>
      )}
      {/*
       * The sentence about device location used to live here, two lines of it,
       * under a listing that is often one line. It said the right thing in a
       * place that made it the loudest thing on the panel and repeated it on
       * every camp the user opened. It is now said once, the first time
       * navigation actually starts — see FirstRun and the navigation notice.
       */}

      {poi.thumbnail && !imageFailed && (
        <Box
          component="img"
          src={poi.thumbnail}
          alt=""
          loading="lazy"
          // Thumbnails are hosted off-playa, so they simply will not load
          // out there. Collapse the element rather than leaving a broken
          // image icon in the middle of the listing.
          onError={() => setImageState((current) => ({ ...current, failed: true }))}
          sx={{ width: '100%', borderRadius: 2, mt: 2, display: 'block' }}
        />
      )}

      {poi.description ? (
        <Typography variant="body2" sx={{ mt: 2, whiteSpace: 'pre-wrap' }}>
          {poi.description}
        </Typography>
      ) : (
        /*
         * Roughly one placed camp in forty has published no description, and
         * a third have no photo either. The panel used to end at the button
         * and leave the reader wondering whether it had failed to load. It is
         * the app talking here rather than the camp, so it is said quietly and
         * in the app's own voice.
         */
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mt: 2, fontStyle: 'italic' }}
        >
          {missingDescription(poi.kind)}
        </Typography>
      )}

      {events.length > 0 && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" gutterBottom>
            {events.length} event{events.length === 1 ? '' : 's'}
          </Typography>
          <List dense disablePadding>
            {events.slice(0, 40).map((event) => (
              <ListItem key={event.uid} disableGutters>
                <ListItemText
                  primary={event.title}
                  secondary={formatOccurrences(event)}
                  slotProps={{ primary: { variant: 'body2' } }}
                />
              </ListItem>
            ))}
          </List>
        </>
      )}
    </>
  )

  /*
   * On a wide screen this is a column of the layout, not a layer over it.
   *
   * As an overlay it was drawn above the app bar and sliced whichever toolbar
   * control it landed on in half — at 1440 it cut a filter key down the middle.
   * And with nothing below the content, a four-line listing left seven hundred
   * pixels of empty paper under it. Now the map gives up the width, the toolbar
   * stays whole, and the space with nothing in it has something to say.
   */
  if (!compact) {
    return (
      <Paper
        elevation={0}
        square
        // The same handle in both layouts: this is a bottom sheet on a phone and
        // a column on a desktop, and nothing outside it should have to know
        // which, or go looking for the class of whichever MUI part draws it.
        data-testid="detail-panel"
        sx={{
          // 400px is right on a wide screen and 44% of a 900px one, which is
          // the narrowest window that still gets this layout at all.
          width: { md: 320, lg: 400 },
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          borderLeft: '1px solid',
          borderColor: 'divider',
          overflowY: 'auto',
        }}
      >
        {poi ? (
          <Box sx={{ p: 2, pb: 3 }}>{body}</Box>
        ) : (
          <Stack
            sx={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              gap: 1.5,
              px: 4,
              color: 'text.secondary',
            }}
          >
            <PlaceOutlinedIcon sx={{ fontSize: 34, opacity: 0.45 }} />
            <Typography variant="body2">
              Pick a camp, a piece of art, or anywhere on the open playa to see what is there and
              how long it takes to walk.
            </Typography>
          </Stack>
        )}
      </Paper>
    )
  }

  return (
    <Drawer
      anchor="bottom"
      open={Boolean(poi)}
      onClose={onClose}
      slotProps={{
        paper: {
          ref: measure,
          sx: {
            maxHeight: 'min(82dvh, calc(100dvh - var(--safe-top) - 16px))',
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            overflowY: 'auto',
          },
        },
      }}
    >
      {poi && (
        <Box
          data-testid="detail-panel"
          sx={{
            p: 2,
            // Past the paper's own safe-area inset. What ends this sheet is
            // usually a photo or a list of events, and either one run hard
            // against the bottom reads as cut off rather than finished.
            pb: 3,
          }}
        >
          {body}
        </Box>
      )}
    </Drawer>
  )
}

function missingDescription(kind: Poi['kind']): string {
  if (kind === 'service' || kind === 'landmark') {
    return 'Part of the surveyed city rather than a listing, so there is nothing more to show.'
  }
  if (kind === 'art') return 'No description published for this piece.'
  return 'No description published yet. Camps often add one closer to the event.'
}

function formatOccurrences(event: EventItem): string {
  const type = event.event_type?.label
  const first = event.occurrence_set[0]
  if (!first) return type ?? ''
  const start = new Date(first.start_time)
  const when = start.toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
  const more = event.occurrence_set.length > 1 ? ` +${event.occurrence_set.length - 1} more` : ''
  return [type, when + more].filter(Boolean).join(' · ')
}
