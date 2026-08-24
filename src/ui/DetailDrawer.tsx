import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
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
import { CATEGORY_LABEL, NON_SERVICE_CATEGORIES } from '../brc/services'
import { PLAYA_TIME_ZONE, relevantOccurrence } from '../data/events'
import type { EventItem, Poi } from '../data/types'

interface Props {
  poi: Poi | undefined
  events: EventItem[]
  /** Where to measure from — the user's GPS fix, or the Man as a fallback. */
  origin: Position
  originLabel: string
  /** The playa schedule clock, so a repeating event shows its current showing. */
  now: Date
  isFavorite: boolean
  /**
   * False for kinds the Saved/Favorites filter always shows regardless of
   * favorite state (civic infrastructure) — starring one of those would be a
   * durable action with no observable effect anywhere in the app.
   */
  canFavorite: boolean
  onToggleFavorite: (uid: string) => void
  onShare: (poi: Poi) => void
  onNavigate: (poi: Poi) => void
  /** Opens an individual hosted event's own detail (description, full schedule). */
  onSelectEvent: (event: EventItem) => void
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

/**
 * The label shown on a POI's kind chip. `civicPois()` keeps every
 * survey-derived place at `kind: 'service'` so filters/favorites treat them
 * as one group, but a Temple or an Airport is not a service — #45. Anywhere
 * the survey's own classification says so (`category` in
 * `NON_SERVICE_CATEGORIES`), that classification is what gets shown instead
 * of the generic kind label.
 */
function kindLabel(poi: Poi): string {
  if (poi.category && NON_SERVICE_CATEGORIES.has(poi.category)) return CATEGORY_LABEL[poi.category]
  return KIND_LABEL[poi.kind]
}

export function DetailDrawer({
  poi,
  events,
  origin,
  originLabel,
  now,
  isFavorite,
  canFavorite,
  onToggleFavorite,
  onShare,
  onNavigate,
  onSelectEvent,
  onClose,
  onMeasure,
  compact,
}: Props) {
  const travel = poi ? travelBetween(origin, poi.position) : undefined
  // Whichever showing is worth reading right now, not whichever the API
  // listed first — a Sunday occurrence is not the useful one on Thursday.
  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => occurrenceSortKey(a, now) - occurrenceSortKey(b, now)),
    [events, now],
  )
  const [imageState, setImageState] = useState<{ uid?: string; failed: boolean }>({
    failed: false,
  })

  // A new listing gets a fresh attempt at its image. Adjusting during render
  // rather than in an effect: React re-runs the component before committing, so
  // the stale "failed" state is never painted.
  if (poi && imageState.uid !== poi.uid) setImageState({ uid: poi.uid, failed: false })
  const imageFailed = imageState.failed

  // The initial cap is a display choice, not a limit on what is reachable —
  // "Show all" is remembered per listing the same way the image attempt is,
  // so switching to a different camp starts collapsed again rather than
  // carrying an unrelated listing's expanded state along with it.
  const [eventsShown, setEventsShown] = useState<{ uid?: string; all: boolean }>({ all: false })
  if (poi && eventsShown.uid !== poi.uid) setEventsShown({ uid: poi.uid, all: false })
  const visibleEvents = eventsShown.all ? sortedEvents : sortedEvents.slice(0, 40)

  // Measured off the paper itself rather than guessed at a fraction of the
  // window: what is in here decides how tall it is, and a listing with a photo
  // and forty events is not the same sheet as one with an address.
  //
  // A plain ref callback only fires when the node itself is created or
  // destroyed. Two things break on that alone: switching from one open
  // listing straight to another (rather than closing first) keeps the same
  // Paper mounted the whole time, so the new content's height is never
  // reported; and MUI's Drawer mounts that Paper behind an internal
  // transition, so on the very first open the node may not exist yet when a
  // plain effect keyed on props would have looked for it, with no second
  // chance once it does. Routing the node through state instead — so its own
  // arrival drives the effect below — fixes the second problem, and a
  // `ResizeObserver` on that persistent node (re-armed on `poi?.uid` too, for
  // the first) fixes both: it fires on a new listing's content, a
  // lazy-loaded photo finishing late, or anything else that changes the
  // sheet's actual height.
  const [paperNode, setPaperNode] = useState<HTMLDivElement | null>(null)
  const paperRef = useCallback((node: HTMLDivElement | null) => setPaperNode(node), [])

  useEffect(() => {
    if (!paperNode || !onMeasure) return
    onMeasure(paperNode.getBoundingClientRect().height)
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) onMeasure(entry.contentRect.height)
    })
    observer.observe(paperNode)
    return () => observer.disconnect()
  }, [paperNode, onMeasure, poi?.uid])

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
          {canFavorite && (
            <IconButton
              onClick={() => onToggleFavorite(poi.uid)}
              size="small"
              aria-label={isFavorite ? 'Remove from favourites' : 'Add to favourites'}
              color={isFavorite ? 'primary' : 'default'}
            >
              {isFavorite ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
            </IconButton>
          )}
          <IconButton onClick={onClose} size="small" aria-label="Close details">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', gap: 1 }}>
        <Chip
          size="small"
          label={kindLabel(poi)}
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
      {poi.accuracyClass === 'derived' && (
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
       * #61: a camp/art record's `gps_latitude`/`gps_longitude` is a real
       * coordinate, but Burning Man's own API documentation describes it as
       * best-effort and published ahead of Placement finishing — a camp can
       * still move after this location was published. That is a materially
       * weaker claim than the GIS survey's own civic points (rangers,
       * toilets, portals), which really are surveyed and get no caveat at
       * all. Conflating the two by dropping this note the moment any GPS
       * field existed is what #61 is about.
       */}
      {poi.accuracyClass === 'published' && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 0.75 }}
        >
          Officially published location — not surveyed. Camps and art can move after this was
          published; if you can't find it, ask a Ranger.
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
            {/* The heading used to promise the full count while the list
                silently cut off at 40 with no indication anything was
                missing — for an event-heavy camp, dozens of real schedule
                entries were simply unreachable from here (issue #28). */}
            {!eventsShown.all && events.length > 40 && ` (showing 40)`}
          </Typography>
          <List dense disablePadding>
            {visibleEvents.map((event) => (
              <ListItem key={event.uid} disableGutters disablePadding>
                {/* Hosted events used to be plain, noninteractive text —
                    reading the title and time here was as far as they went.
                    Every row now opens the event's own detail, the same
                    place EventsPanel's rows lead to (issue #20). */}
                <ListItemButton onClick={() => onSelectEvent(event)} sx={{ py: 0.75 }}>
                  <ListItemText
                    primary={event.title}
                    secondary={formatOccurrences(event, now)}
                    slotProps={{ primary: { variant: 'body2' } }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
          {!eventsShown.all && events.length > 40 && (
            <Button
              size="small"
              onClick={() => setEventsShown({ uid: poi?.uid, all: true })}
              sx={{ mt: 0.5 }}
            >
              Show all {events.length}
            </Button>
          )}
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
          ref: paperRef,
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

function formatOccurrences(event: EventItem, now: Date): string {
  const type = event.event_type?.label
  const relevant = relevantOccurrence(event, now)
  if (!relevant) return type ?? ''
  const start = new Date(relevant.occurrence.start_time)
  const when = start.toLocaleString(undefined, {
    timeZone: PLAYA_TIME_ZONE,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
  const suffix = relevant.state === 'ended' ? ' (ended)' : ''
  const more = event.occurrence_set.length > 1 ? ` +${event.occurrence_set.length - 1} more` : ''
  return [type, when + suffix + more].filter(Boolean).join(' · ')
}

/** Running first, then soonest upcoming, then most-recently-ended last. */
function occurrenceSortKey(event: EventItem, now: Date): number {
  const relevant = relevantOccurrence(event, now)
  if (!relevant) return Infinity
  const time = new Date(
    relevant.state === 'ended' ? relevant.occurrence.end_time : relevant.occurrence.start_time,
  ).getTime()
  if (relevant.state === 'running') return time
  if (relevant.state === 'upcoming') return 1e15 + time
  return 2e15 - time
}
