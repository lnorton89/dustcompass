import {
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import type { EventItem, Poi } from '../data/types'

interface Props {
  poi: Poi | undefined
  events: EventItem[]
  onClose: () => void
}

export function DetailDrawer({ poi, events, onClose }: Props) {
  return (
    <Drawer
      anchor="right"
      open={Boolean(poi)}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: { xs: '100%', sm: 400 } } } }}
    >
      {poi && (
        <Box sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="h6">{poi.name}</Typography>
              {poi.subtitle && (
                <Typography variant="body2" color="text.secondary">
                  {poi.subtitle}
                </Typography>
              )}
            </Box>
            <IconButton onClick={onClose} size="small" aria-label="Close details">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>

          <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
            <Chip
              size="small"
              label={poi.kind}
              color={poi.kind === 'art' ? 'primary' : 'secondary'}
            />
            {poi.address && <Chip size="small" variant="outlined" label={poi.address} />}
          </Stack>

          {poi.thumbnail && (
            <Box
              component="img"
              src={poi.thumbnail}
              alt=""
              loading="lazy"
              sx={{ width: '100%', borderRadius: 2, mt: 2, display: 'block' }}
            />
          )}

          {poi.description && (
            <Typography variant="body2" sx={{ mt: 2, whiteSpace: 'pre-wrap' }}>
              {poi.description}
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
        </Box>
      )}
    </Drawer>
  )
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
