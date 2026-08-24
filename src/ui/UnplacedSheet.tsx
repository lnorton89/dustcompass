import { useState } from 'react'
import { Box, Chip, Drawer, IconButton, Stack, Typography } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import IosShareIcon from '@mui/icons-material/IosShare'
import type { UnplacedListing } from '../data/types'

interface Props {
  listing: UnplacedListing | undefined
  onShare: (listing: UnplacedListing) => void
  onClose: () => void
  /** Phone layout: come up from the bottom instead of in from the side. */
  compact?: boolean
}

/**
 * A listing with everything except a place.
 *
 * Not the detail drawer with its parts switched off: nearly all of that panel
 * is distance, direction and a button that takes you there, and none of it
 * means anything without a position. What is left — who made it, what it is —
 * is the whole of this one, and it is what people read in the week before the
 * gates open.
 */
export function UnplacedSheet({ listing, onShare, onClose, compact }: Props) {
  const [imageState, setImageState] = useState<{ uid?: string; failed: boolean }>({ failed: false })
  if (listing && imageState.uid !== listing.uid) setImageState({ uid: listing.uid, failed: false })

  return (
    <Drawer
      anchor={compact ? 'bottom' : 'right'}
      open={Boolean(listing)}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: compact
            ? {
                maxHeight: 'min(82dvh, calc(100dvh - var(--safe-top) - 16px))',
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                overflowY: 'auto',
              }
            : { width: 400 },
        },
      }}
    >
      {listing && (
        <Box sx={{ p: 2, pb: 3 }}>
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}
          >
            <Box>
              <Typography variant="h6">{listing.name}</Typography>
              {listing.subtitle && (
                <Typography variant="body2" color="text.secondary">
                  {listing.subtitle}
                </Typography>
              )}
            </Box>
            <Stack direction="row" spacing={0.5}>
              <IconButton
                onClick={() => onShare(listing)}
                size="small"
                aria-label="Share this listing"
              >
                <IosShareIcon fontSize="small" />
              </IconButton>
              <IconButton onClick={onClose} size="small" aria-label="Close details">
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Stack>

          <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
            <Chip size="small" label={listing.kind} color={listing.kind === 'art' ? 'primary' : 'secondary'} />
          </Stack>

          {/*
            Said plainly and without apology. An embargo is a date the reader
            can plan around, which a vague "unavailable" is not.
          */}
          <Typography variant="body2" color="warning.main" sx={{ mt: 2, fontWeight: 650 }}>
            {listing.reason === 'embargoed'
              ? listing.kind === 'art'
                ? 'Location published when Gates open.'
                : 'Location published closer to the event.'
              : listing.reason === 'stale'
                ? 'This location is out — this copy of the map is older than it is.'
                : 'No location published for this listing.'}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            {listing.reason === 'stale'
              ? 'A minute of signal is enough to pick it up. Until then there is nothing to navigate to.'
              : 'It is not on the map yet, so there is nothing to navigate to.'}
          </Typography>

          {listing.thumbnail && !imageState.failed && (
            <Box
              component="img"
              src={listing.thumbnail}
              alt=""
              loading="lazy"
              // Hosted off-playa, so out there it will not load at all.
              onError={() => setImageState((current) => ({ ...current, failed: true }))}
              sx={{ width: '100%', borderRadius: 2, mt: 2, display: 'block' }}
            />
          )}

          {listing.description ? (
            <Typography variant="body2" sx={{ mt: 2, whiteSpace: 'pre-wrap' }}>
              {listing.description}
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, fontStyle: 'italic' }}>
              {listing.kind === 'art'
                ? 'No description published for this piece.'
                : 'No description published yet. Camps often add one closer to the event.'}
            </Typography>
          )}
        </Box>
      )}
    </Drawer>
  )
}
