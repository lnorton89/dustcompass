import { useState } from 'react'
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
  /** Phone layout: come up from the bottom instead of in from the side. */
  compact?: boolean
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
  return (
    <Drawer
      anchor={compact ? 'bottom' : "right"}
      open={Boolean(poi)}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: compact
            ? {
                maxHeight: 'min(82dvh, calc(100dvh - env(safe-area-inset-top) - 16px))',
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                overflowY: 'auto',
              }
            : { width: 400 },
        },
      }}
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
            <Stack direction="row" spacing={0.5}>
              <IconButton
                onClick={() => onShare(poi)}
                size="small"
                aria-label="Share this location"
              >
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

          <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
            <Chip
              size="small"
              label={poi.kind}
              color={poi.kind === 'art' ? 'primary' : 'secondary'}
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
          <Typography variant="caption" color="text.secondary">
            from {originLabel}
          </Typography>

          <Button
            variant="contained"
            size="small"
            startIcon={<NearMeIcon />}
            onClick={() => onNavigate(poi)}
            sx={{ mt: 2 }}
            fullWidth
          >
            {poi.positionSource === 'address' ? 'Take me there · address area' : 'Take me there'}
          </Button>
          {poi.positionSource === 'address' && (
            <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 0.75, fontWeight: 650 }}>
              Approximate pin at {poi.address ?? 'the listed address'}. Nearby camps can share this same map point.
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
            Uses your device location only while navigation is active. Your position stays on this device.
          </Typography>

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
