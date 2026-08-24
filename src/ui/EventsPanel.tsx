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
import type { EventItem, Poi } from '../data/types'
import { PLAYA_TIME_ZONE, formatWhen, occurrencesInWindow, type EventWindow } from '../data/events'
import { formatDistance, travelBetween } from '../brc/travel'
import type { Position } from '../brc/geo'

interface Props {
  open: boolean
  events: EventItem[]
  /** Camps and art by uid, so an event can be located on the map. */
  hosts: Map<string, Poi>
  now: Date
  /** True when `now` has been scrubbed to the start of the burn. */
  preview: boolean
  /** Where to measure from when sorting by distance. */
  origin?: Position
  /** Asked for when someone chooses "Closest" without a fix yet. */
  onNeedLocation: () => void
  onSelect: (poi: Poi) => void
  onClose: () => void
  /** Phone layout: come up from the bottom instead of in from the side. */
  compact?: boolean
}

const WINDOWS: { value: EventWindow; label: string }[] = [
  { value: 'now', label: 'Now' },
  { value: 'next3h', label: 'Next 3h' },
  { value: 'today', label: 'Today' },
  { value: 'all', label: 'All' },
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
  now,
  preview,
  origin,
  onNeedLocation,
  onSelect,
  onClose,
  compact,
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
  const rows = useMemo(() => {
    const found = occurrencesInWindow(events, window, now)
    const located = found.map((row) => {
      const hostId = row.event.hosted_by_camp ?? row.event.located_at_art ?? ''
      const host = hosts.get(hostId)
      const travel = host && origin ? travelBetween(origin, host.position) : undefined
      return { ...row, host, travel }
    })

    const term = query.trim().toLowerCase()
    const matching = term
      ? located.filter((row) =>
          [
            row.event.title,
            row.host?.name,
            row.event.other_location,
            row.event.event_type?.label,
          ].some((field) => field?.toLowerCase().includes(term)),
        )
      : located

    if (sort === 'distance' && origin) {
      matching.sort((a, b) => (a.travel?.meters ?? Infinity) - (b.travel?.meters ?? Infinity))
    }
    return matching.slice(0, 300)
  }, [events, window, now, sort, origin, hosts, query])

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
          aria-label="Search events"
          sx={{ mt: 1.5 }}
          slotProps={{
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
              const next = sort === 'distance' ? 'time' : 'distance'
              setSort(next)
              // Choosing "Closest" is the moment asking for location makes
              // sense — offering the sort only after a fix exists means it is
              // never there when it is first wanted.
              if (next === 'distance' && !origin) onNeedLocation()
            }}
            sx={{ flexShrink: 0, gap: 0.5, px: 1.25 }}
          >
            <NearMeIcon sx={{ fontSize: 17 }} />
            Closest
          </ToggleButton>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {rows.length === 300 ? 'showing first 300' : `${rows.length} showing`}
          {sort === 'distance' && !origin && ' · finding you…'}
          {preview &&
            ` · previewing from ${now.toLocaleDateString(undefined, { timeZone: PLAYA_TIME_ZONE, weekday: 'long', month: 'short', day: 'numeric' })}`}
        </Typography>
      </Box>

      {/* The rows scroll; the header above them stays. `pb` keeps the last
          event clear of the screen edge instead of flush against it. */}
      <List dense sx={{ overflowY: 'auto', flex: '0 1 auto', pb: 1.5 }}>
        {rows.map((row, index) => {
          const host = row.host
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
                      host?.name ?? row.event.other_location,
                      live ? undefined : formatWhen(row, now),
                      row.travel && formatDistance(row.travel),
                      host ? undefined : 'location not listed',
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
          return (
            // A plain <li> wrapping the button: putting role="button" on the
            // <li> itself would strip its list semantics from the a11y tree.
            <ListItem key={`${row.event.uid}-${index}`} disablePadding>
              {/*
               * Events at an unregistered camp used to render as a
               * `ListItemButton` whose click handler did nothing — a control
               * that advertised itself as actionable to a screen reader and a
               * keyboard user while performing no action for either. Plenty
               * of the good ones are at a camp that never filed a location,
               * and the listing is still worth reading; it just is not
               * something to tap, so it is no longer marked up as one.
               */}
              {host ? (
                <ListItemButton onClick={() => onSelect(host)} sx={{ cursor: 'pointer', ...rowSx }}>
                  {content}
                </ListItemButton>
              ) : (
                <Box sx={{ display: 'flex', width: '100%', px: 2, ...rowSx }}>{content}</Box>
              )}
            </ListItem>
          )
        })}
      </List>
      {rows.length === 0 && (
        // An empty state has to carry its own way out. "Nothing scheduled in
        // this window" was true, unhelpful, and a dead end.
        <Box sx={{ px: 2, pt: 1, pb: 3 }}>
          <Typography variant="body2" color="text.secondary">
            {query
              ? `Nothing matching “${query}” in this window.`
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
