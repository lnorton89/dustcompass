import { useMemo, useState } from 'react'
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

interface Props {
  open: boolean
  events: EventItem[]
  /** Camps and art by uid, so an event can be located on the map. */
  hosts: Map<string, Poi>
  now: Date
  /** True when `now` has been scrubbed to the start of the burn. */
  preview: boolean
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
  onSelect,
  onClose,
  compact,
}: Props) {
  const [window, setWindow] = useState<EventWindow>('now')

  const rows = useMemo(
    () => occurrencesInWindow(events, window, now).slice(0, 300),
    [events, window, now],
  )

  return (
    <Drawer
      anchor={compact ? 'bottom' : "left"}
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: compact
            ? { height: '70dvh', borderTopLeftRadius: 16, borderTopRightRadius: 16 }
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
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {rows.length === 300 ? 'showing first 300' : `${rows.length} showing`}
          {preview &&
            ` · previewing from ${now.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}`}
        </Typography>
      </Box>

      <List dense sx={{ overflowY: 'auto' }}>
        {rows.map((row, index) => {
          const hostId = row.event.hosted_by_camp ?? row.event.located_at_art ?? ''
          const host = hosts.get(hostId)
          return (
            // A plain <li> wrapping the button: putting role="button" on the
            // <li> itself would strip its list semantics from the a11y tree.
            <ListItem key={`${row.event.uid}-${index}`} disablePadding>
              <ListItemButton disabled={!host} onClick={() => host && onSelect(host)}>
                <ListItemText
                  primary={row.event.title}
                  secondary={[host?.name ?? row.event.other_location, formatWhen(row, now)]
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
        <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 3 }}>
          Nothing scheduled in this window.
        </Typography>
      )}
    </Drawer>
  )
}
