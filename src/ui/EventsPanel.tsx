import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  Button,
  Chip,
  Drawer,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import SearchIcon from '@mui/icons-material/Search'
import NearMeIcon from '@mui/icons-material/NearMe'
import ScheduleIcon from '@mui/icons-material/Schedule'
import BookmarkIcon from '@mui/icons-material/Bookmark'
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder'
import type { EventItem, Poi } from '../data/types'
import {
  PLAYA_TIME_ZONE,
  formatWhen,
  occurrencesInWindow,
  relevantOccurrence,
  resolveEventLocation,
  type EventWindow,
  type LiveEvent,
} from '../data/events'
import { formatDistance, travelBetween } from '../brc/travel'
import type { Position } from '../brc/geo'
import type { CityLayout } from '../brc/layout'
import type { LocationStatus } from '../data/useGeolocation'
import type { SavedEvent } from '../data/useSavedEvents'

interface Props {
  open: boolean
  events: EventItem[]
  /** Camps and art by uid, so an event can be located on the map. */
  hosts: Map<string, Poi>
  /** So a free-form `other_location` can be tried against the same geocoder the search box uses. */
  layout: CityLayout
  now: Date
  /** True when `now` has been scrubbed to the start of the burn. */
  preview: boolean
  /** Where to measure from when sorting by distance. */
  origin?: Position
  /** State of the shared location watch, so a denial can be told apart from still locating. */
  locationStatus: LocationStatus
  /** Asked for when someone chooses "Closest" without a fix yet. */
  onNeedLocation: () => void
  /**
   * Called whenever this panel no longer needs the location watch it may
   * have asked for — sort left "Closest", or the panel closed. The caller
   * owns the actual watch and may keep it running for another reason (e.g.
   * active navigation); this only ever releases this panel's own claim.
   */
  onDoneWithLocation: () => void
  /** Opens the event's own detail — every row, host or not, goes here. */
  onSelectEvent: (event: EventItem) => void
  onClose: () => void
  /** Phone layout: come up from the bottom instead of in from the side. */
  compact?: boolean
  /** The saved-events snapshot backing the "Saved" window — see `useSavedEvents`. */
  savedEvents: SavedEvent[]
  isEventSaved: (uid: string) => boolean
  onToggleSaveEvent: (event: EventItem) => void
  /** Drops a saved uid that no longer matches anything in `events`. */
  onRemoveSavedEvent: (uid: string) => void
}

/** How many matching events are rendered at once — a rendering choice, not a limit on what's reachable (#54). */
const PAGE_SIZE = 300

const WINDOWS: { value: EventWindow; label: string }[] = [
  { value: 'now', label: 'Now' },
  { value: 'next3h', label: 'Next 3h' },
  { value: 'today', label: 'Today' },
  { value: 'all', label: 'All' },
  { value: 'saved', label: 'Saved' },
]

/**
 * "What is happening right now, and can I get there" is the question this
 * answers. Events without a locatable host are still listed — plenty of the
 * good ones are at an unregistered camp — but they cannot be flown to.
 */
export function EventsPanel({
  open,
  events,
  hosts,
  layout,
  now,
  preview,
  origin,
  locationStatus,
  onNeedLocation,
  onDoneWithLocation,
  onSelectEvent,
  onClose,
  compact,
  savedEvents,
  isEventSaved,
  onToggleSaveEvent,
  onRemoveSavedEvent,
}: Props) {
  // "Now" is the right question during the event and a useless one before it:
  // scrubbed to the opening minute of the burn, one thing is running out of
  // three thousand. Previewing a day reads as a schedule; previewing an instant
  // reads as a broken app.
  const [window, setWindow] = useState<EventWindow>(preview ? 'today' : 'now')
  const wasPreview = useRef(preview)
  useEffect(() => {
    if (wasPreview.current !== preview) {
      wasPreview.current = preview
      setWindow(preview ? 'today' : 'now')
    }
  }, [preview])
  const [sort, setSort] = useState<'time' | 'distance'>('time')
  // Set once a location attempt made for "Closest" comes back denied or
  // unavailable, so the terminal state stays visible until a retry — not
  // just for the instant the status flips.
  const [locationIssue, setLocationIssue] = useState(false)
  const locationFailed = locationStatus === 'denied' || locationStatus === 'unavailable'
  useEffect(() => {
    // A permission denial must not leave "Closest" selected while the rows
    // have silently fallen back to plain time order — that reads as a
    // working distance sort that simply never finishes. Fall back to time
    // sorting explicitly, and say why, rather than leaving it indefinitely
    // on "finding you…".
    if (sort === 'distance' && locationFailed) {
      setSort('time')
      setLocationIssue(true)
    }
    // A fix arriving by any route (navigation, the map's own locate button)
    // resolves the notice; it is not scoped to this panel's own request.
    if (locationStatus === 'tracking') setLocationIssue(false)
  }, [sort, locationFailed, locationStatus])
  const retryLocation = () => {
    setLocationIssue(false)
    // The location-ownership effect below asks again on its own once sort
    // is back to 'distance' — calling onNeedLocation directly here too would
    // double-acquire it.
    setSort('distance')
  }
  /**
   * The watch this panel asked for is only worth keeping while the panel is
   * both open and actually sorted by distance — not for the rest of the
   * session after Closest is turned off or the panel is closed. The effect's
   * own cleanup is what releases it: whenever the condition goes false
   * (deps change or the component unmounts), whatever claim the previous run
   * took out is given back first.
   */
  useEffect(() => {
    if (open && sort === 'distance') {
      onNeedLocation()
      return () => onDoneWithLocation()
    }
  }, [open, sort, onNeedLocation, onDoneWithLocation])
  /**
   * A window and a sort were the only two questions you could ask of three
   * thousand listings. "Is my friend's camp doing the pancake thing again" was
   * not among them. Matched against the title, the host's name and the type, so
   * "yoga", "Ranger" and "Center Camp" all find something.
   */
  const [query, setQuery] = useState('')

  /**
   * "What is on now" is only half the question — the other half is whether you
   * can get there before it ends. Sorting by distance answers both at once, and
   * only makes sense once there is somewhere to measure from.
   */
  /**
   * "Saved" is not a time window like the others — it is a fixed set of
   * events, one row each, shown at whichever showing is relevant right now.
   * Reuses the same `relevantOccurrence` helper `EventDetail` and hosted-event
   * rows already use for "which showing of this repeating event matters right
   * now", rather than inventing a second way to pick one.
   */
  const savedLive = useMemo(() => {
    if (window !== 'saved') return []
    const byUid = new Map(events.map((event) => [event.uid, event] as const))
    const live: LiveEvent[] = []
    for (const saved of savedEvents) {
      const event = byUid.get(saved.uid)
      if (!event) continue
      const relevant = relevantOccurrence(event, now)
      if (!relevant) continue
      live.push({
        event,
        occurrence: relevant.occurrence,
        start: new Date(relevant.occurrence.start_time),
        end: new Date(relevant.occurrence.end_time),
      })
    }
    return live.sort((a, b) => a.start.getTime() - b.start.getTime())
  }, [window, events, savedEvents, now])

  /**
   * A saved uid a later data refresh dropped (event deleted, cancelled, or
   * replaced) has to degrade to a harmless row, not vanish or resolve to
   * whatever unrelated event now happens to reuse that uid string. Matched by
   * uid against the *current* `events`, never against anything remembered
   * from the save — a stale match would be exactly the silent-reuse failure
   * this is guarding against.
   */
  const missingSavedEvents = useMemo(() => {
    if (window !== 'saved') return []
    const presentUids = new Set(events.map((event) => event.uid))
    const term = query.trim().toLowerCase()
    return savedEvents.filter(
      (saved) => !presentUids.has(saved.uid) && (!term || saved.title.toLowerCase().includes(term)),
    )
  }, [window, events, savedEvents, query])

  const matching = useMemo(() => {
    const found = window === 'saved' ? savedLive : occurrencesInWindow(events, window, now)
    const located = found.map((row) => {
      const hostId = row.event.hosted_by_camp ?? row.event.located_at_art ?? ''
      const host = hosts.get(hostId)
      // A registered host wins; otherwise a parseable `other_location` gets
      // to behave like a real address too — closest sorting and navigation
      // used to be unavailable to those events even when the address was
      // perfectly good, simply because nothing ever tried to resolve it.
      const location = resolveEventLocation(row.event, host, layout)
      const position =
        location.kind === 'host'
          ? location.poi.position
          : location.kind === 'geocoded'
            ? location.position
            : undefined
      const travel = position && origin ? travelBetween(origin, position) : undefined
      return { ...row, host, location, travel }
    })

    const term = query.trim().toLowerCase()
    const filtered = term
      ? located.filter((row) =>
          [
            row.event.title,
            row.host?.name,
            row.event.other_location,
            row.event.event_type?.label,
            // A word that lives only in what an event is about — "coffee",
            // "karaoke" — used to be unfindable even though the description
            // is right there in the offline data.
            row.event.description,
            row.event.print_description,
          ].some((field) => field?.toLowerCase().includes(term)),
        )
      : located

    if (sort === 'distance' && origin) {
      filtered.sort((a, b) => (a.travel?.meters ?? Infinity) - (b.travel?.meters ?? Infinity))
    }
    return filtered
  }, [events, window, now, sort, origin, hosts, layout, query, savedLive])

  /**
   * `matching` is the complete set — sorting/filtering above already runs
   * across all of it, not just a visible slice. What used to be a hard
   * `.slice(0, 300)` with no way past it (issue #54) is now how much of that
   * complete set is actually rendered, so thousands of events don't all
   * become DOM nodes at once on a low-end phone, but every one past the
   * first page stays reachable with "Load more" rather than vanishing.
   *
   * Reset to the first page whenever the window, sort, having a live origin,
   * or the search term changes — a stale "loaded 900" position from a
   * completely different filter is not a page anyone asked to keep. `now`
   * ticking is deliberately not part of that key: it reshuffles `matching`'s
   * contents without changing what the reader is looking for, and resetting
   * on every tick would snap someone's loaded-more list back to page one.
   */
  const pageKey = `${window}|${sort}|${Boolean(origin)}|${query}`
  const [paging, setPaging] = useState({ key: pageKey, shown: PAGE_SIZE })
  if (paging.key !== pageKey) setPaging({ key: pageKey, shown: PAGE_SIZE })
  const rows = matching.slice(0, paging.shown)

  return (
    <Drawer
      anchor={compact ? 'bottom' : "left"}
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: compact
            ? {
                // Tall enough to read a schedule in, but bounded by what is
                // in it: a fixed 70dvh left an empty window sitting behind
                // two-thirds of a screen of nothing.
                maxHeight: 'min(78dvh, calc(100dvh - var(--safe-top) - 16px))',
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
              }
            : { width: 380 },
        },
      }}
    >
      <Box sx={{ p: 2, pb: 1 }}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Typography variant="h6">Events</Typography>
          <IconButton onClick={onClose} size="small" aria-label="Close events">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
        {/* Three thousand events and, until now, no way to ask for one by
            name — only a time window and a two-way sort. On a phone those two
            stacked full-width rows also ate most of the sheet before the first
            event appeared. Search first, window below it, and the sort folded
            in beside the window as a single toggle. */}
        <TextField
          fullWidth
          size="small"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search events or camps"
          sx={{ mt: 1.5 }}
          slotProps={{
            htmlInput: { 'aria-label': 'Search events' },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: query ? (
                <InputAdornment position="end">
                  <IconButton size="small" aria-label="Clear search" onClick={() => setQuery('')}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            },
          }}
        />
        <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'stretch' }}>
          <ToggleButtonGroup
            size="small"
            exclusive
            fullWidth
            value={window}
            onChange={(_, value: EventWindow | null) => value && setWindow(value)}
            sx={{ flex: 1 }}
          >
            {WINDOWS.map((w) => (
              <ToggleButton key={w.value} value={w.value}>
                {w.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <ToggleButton
            size="small"
            value="distance"
            selected={sort === 'distance'}
            onChange={() => {
              // Requesting/releasing the watch itself is the location-
              // ownership effect's job, keyed on this same sort state — it
              // asks the moment "Closest" is chosen, which is the moment
              // asking for location first makes sense, and releases it the
              // moment sort leaves 'distance' again, however that happens.
              setSort(sort === 'distance' ? 'time' : 'distance')
              setLocationIssue(false)
            }}
            sx={{ flexShrink: 0, gap: 0.5, px: 1.25 }}
          >
            <NearMeIcon sx={{ fontSize: 17 }} />
            Closest
          </ToggleButton>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {rows.length < matching.length
            ? `${rows.length} of ${matching.length} showing`
            : `${rows.length + missingSavedEvents.length} showing`}
          {sort === 'distance' && !origin && ' · finding you…'}
          {preview &&
            ` · previewing from ${now.toLocaleDateString(undefined, { timeZone: PLAYA_TIME_ZONE, weekday: 'long', month: 'short', day: 'numeric' })}`}
        </Typography>
        {locationIssue && (
          // A terminal state rather than the same "finding you…" left running
          // forever — permission denial does not resolve itself, so nothing
          // here is worth waiting on without pressing Retry.
          <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'warning.main' }}>
            {locationStatus === 'denied'
              ? 'Location access is off, so events are sorted by time instead.'
              : 'Could not get your location, so events are sorted by time instead.'}{' '}
            <Button
              type="button"
              onClick={retryLocation}
              variant="text"
              disableRipple
              sx={{
                minWidth: 44,
                minHeight: 44,
                p: 0.5,
                my: -1.5,
                color: 'primary.main',
                textDecoration: 'underline',
                font: 'inherit',
                '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' },
              }}
            >
              Retry
            </Button>
          </Typography>
        )}
      </Box>

      {/* The rows scroll; the header above them stays. `pb` keeps the last
          event clear of the screen edge instead of flush against it. */}
      <List dense sx={{ overflowY: 'auto', flex: '0 1 auto', pb: 1.5 }}>
        {rows.map((row, index) => {
          const live = row.start <= now && row.end > now
          const content = (
            <>
              <ListItemText
                primary={row.event.title}
                secondary={
                  <>
                    {/* "On now" is the single most useful fact in this list
                        and it was buried mid-sentence in grey. */}
                    {live && (
                      <Box
                        component="span"
                        sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 0.35,
                          mr: 0.75,
                          color: 'primary.main',
                          fontWeight: 700,
                        }}
                      >
                        <ScheduleIcon sx={{ fontSize: 14 }} />
                        {formatWhen(row, now)}
                      </Box>
                    )}
                    {[
                      row.location.kind === 'host'
                        ? row.location.poi.name
                        : row.location.kind !== 'none'
                          ? row.location.label
                          : undefined,
                      live ? undefined : formatWhen(row, now),
                      row.travel && formatDistance(row.travel),
                      // A truly empty field is the only case that is
                      // "not listed" — free-form text that just did not
                      // parse is shown for what it is, not folded into the
                      // same message as having nothing at all (issue #29).
                      row.location.kind === 'none'
                        ? 'location not listed'
                        : row.location.kind === 'unmapped'
                          ? 'not mapped'
                          : undefined,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </>
                }
                slotProps={{
                  primary: { variant: 'body2', sx: { fontWeight: 600 } },
                  secondary: { variant: 'caption' },
                }}
              />
              {row.event.event_type && (
                // `abbr` is the API's four-letter code — "prty", "othr",
                // "adlt". Nobody outside the dataset knows what those mean.
                <Chip
                  size="small"
                  variant="outlined"
                  label={row.event.event_type.label}
                  sx={{ flexShrink: 0, mt: 0.25, maxWidth: 120 }}
                />
              )}
            </>
          )
          const rowSx = { alignItems: 'flex-start', gap: 1, py: 1 }
          const saved = isEventSaved(row.event.uid)
          return (
            // A plain <li> wrapping the button: putting role="button" on the
            // <li> itself would strip its list semantics from the a11y tree.
            <ListItem
              key={`${row.event.uid}-${index}`}
              disablePadding
              secondaryAction={
                <IconButton
                  edge="end"
                  size="small"
                  aria-label={saved ? 'Remove from saved events' : 'Save this event'}
                  color={saved ? 'primary' : 'default'}
                  onClick={() => onToggleSaveEvent(row.event)}
                >
                  {saved ? <BookmarkIcon fontSize="small" /> : <BookmarkBorderIcon fontSize="small" />}
                </IconButton>
              }
            >
              {/*
               * Every row opens the event's own detail — description, full
               * occurrence list, and (when available) navigation — whether
               * or not it has a registered host. Events at an unregistered
               * camp used to render as a `ListItemButton` whose click
               * handler did nothing at all; now there is always something
               * for the tap to do, located or not (issue #20).
               */}
              <ListItemButton
                onClick={() => onSelectEvent(row.event)}
                sx={{ cursor: 'pointer', pr: 6, ...rowSx }}
              >
                {content}
              </ListItemButton>
            </ListItem>
          )
        })}
        {window === 'saved' &&
          missingSavedEvents.map((saved) => (
            // A saved uid a later data refresh no longer has anything for —
            // deleted or cancelled, not just currently outside this window.
            // Rendered as its own harmless row, using the title snapshotted
            // at save time, rather than being silently dropped or (worse)
            // resolved against a different event that happens to reuse the
            // uid.
            <ListItem
              key={`missing-${saved.uid}`}
              disablePadding
              secondaryAction={
                <IconButton
                  edge="end"
                  size="small"
                  aria-label={`Remove ${saved.title} from saved events`}
                  onClick={() => onRemoveSavedEvent(saved.uid)}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              }
            >
              <Box sx={{ width: '100%', py: 1, pl: 2, pr: 6 }}>
                <ListItemText
                  primary={saved.title}
                  secondary="No longer listed this year"
                  slotProps={{
                    primary: {
                      variant: 'body2',
                      sx: { fontWeight: 600, color: 'text.secondary' },
                    },
                    secondary: { variant: 'caption', sx: { color: 'text.secondary' } },
                  }}
                />
              </Box>
            </ListItem>
          ))}
      </List>
      {rows.length < matching.length && (
        // The initial cap is a rendering choice, not a limit on what is
        // reachable — every matching event past the first page stays
        // reachable here rather than becoming invisible the way a hard
        // `.slice(0, 300)` with no continuation used to (issue #54).
        <Box sx={{ px: 2, pb: 1.5 }}>
          <Button
            size="small"
            fullWidth
            onClick={() => setPaging({ key: pageKey, shown: paging.shown + PAGE_SIZE })}
          >
            Load {Math.min(PAGE_SIZE, matching.length - rows.length)} more ({matching.length - rows.length} left)
          </Button>
        </Box>
      )}
      {rows.length === 0 && missingSavedEvents.length === 0 && (
        // An empty state has to carry its own way out. "Nothing scheduled in
        // this window" was true, unhelpful, and a dead end.
        <Box sx={{ px: 2, pt: 1, pb: 3 }}>
          <Typography variant="body2" color="text.secondary">
            {query
              ? `Nothing matching “${query}” in this window.`
              : window === 'saved'
                ? 'No saved events yet — tap the bookmark icon on an event to add it here.'
                : 'Nothing scheduled in this window.'}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', gap: 1 }}>
            {query && (
              <Button size="small" variant="outlined" onClick={() => setQuery('')}>
                Clear search
              </Button>
            )}
            {window !== 'today' && (
              <Button size="small" variant="outlined" onClick={() => setWindow('today')}>
                Show today
              </Button>
            )}
            {window !== 'all' && (
              <Button size="small" variant="outlined" onClick={() => setWindow('all')}>
                Show all events
              </Button>
            )}
          </Stack>
        </Box>
      )}
    </Drawer>
  )
}
