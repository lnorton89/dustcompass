import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  Chip,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import type { EventItem, Poi } from '../data/types'
import { formatWhen, occurrencesInWindow, type EventWindow } from '../data/events'
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

    if (sort === 'distance' && origin) {
      located.sort((a, b) => (a.travel?.meters ?? Infinity) - (b.travel?.meters ?? Infinity))
    }
    return located.slice(0, 300)
  }, [events, window, now, sort, origin, hosts])

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
        <ToggleButtonGroup
          size="small"
          exclusive
          fullWidth
          value={window}
          onChange={(_, value: EventWindow | null) => value && setWindow(value)}
          sx={{ mt: 1.5 }}
        >
          {WINDOWS.map((w) => (
            <ToggleButton key={w.value} value={w.value}>
              {w.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <ToggleButtonGroup
          size="small"
          exclusive
          fullWidth
          value={sort}
          onChange={(_, value: 'time' | 'distance' | null) => {
            if (!value) return
            setSort(value)
            // Choosing "Closest" is the moment asking for location makes
            // sense — offering the sort only after a fix exists means it is
            // never there when it is first wanted.
            if (value === 'distance' && !origin) onNeedLocation()
          }}
          sx={{ mt: 1 }}
        >
          <ToggleButton value="time">By time</ToggleButton>
          <ToggleButton value="distance">Closest</ToggleButton>
        </ToggleButtonGroup>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {rows.length === 300 ? 'showing first 300' : `${rows.length} showing`}
          {sort === 'distance' && !origin && ' · finding you…'}
          {preview &&
            ` · previewing from ${now.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}`}
        </Typography>
      </Box>

      {/* The rows scroll; the header above them stays. `pb` keeps the last
          event clear of the screen edge instead of flush against it. */}
      <List dense sx={{ overflowY: 'auto', flex: '0 1 auto', pb: 1.5 }}>
        {rows.map((row, index) => {
          const host = row.host
          return (
            // A plain <li> wrapping the button: putting role="button" on the
            // <li> itself would strip its list semantics from the a11y tree.
            <ListItem key={`${row.event.uid}-${index}`} disablePadding>
              <ListItemButton disabled={!host} onClick={() => host && onSelect(host)}>
                <ListItemText
                  primary={row.event.title}
                  secondary={[
                    host?.name ?? row.event.other_location,
                    formatWhen(row, now),
                    row.travel && formatDistance(row.travel),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  slotProps={{ primary: { variant: 'body2' } }}
                />
                {row.event.event_type && (
                  <Chip size="small" variant="outlined" label={row.event.event_type.abbr} />
                )}
              </ListItemButton>
            </ListItem>
          )
        })}
      </List>
      {rows.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ px: 2, pt: 1, pb: 3 }}>
          Nothing scheduled in this window.
        </Typography>
      )}
    </Drawer>
  )
}
