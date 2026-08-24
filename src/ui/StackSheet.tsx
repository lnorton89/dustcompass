import {
  Box,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import LocalActivityIcon from '@mui/icons-material/LocalActivity'
import PaletteIcon from '@mui/icons-material/Palette'
import type { Poi } from '../data/types'

interface Props {
  /** Everything sharing one point on the map, or nothing when closed. */
  stack: Poi[] | undefined
  onChoose: (poi: Poi) => void
  onClose: () => void
  /** Phone layout: come up from the bottom instead of in from the side. */
  compact?: boolean
}

/**
 * Who is at this address.
 *
 * A playa address names an intersection, and until the survey publishes
 * coordinates every listing is placed from its address — so most points on the
 * map carry several camps, the deepest of them nine. Tapping used to hand back
 * whichever one the renderer happened to return first, which meant the other
 * eight could not be reached from the map at all and nothing said they were
 * there. This is the list, in the order the reader can act on it.
 */
export function StackSheet({ stack, onChoose, onClose, compact }: Props) {
  const address = stack?.[0]?.address
  return (
    <Drawer
      anchor={compact ? 'bottom' : 'right'}
      open={Boolean(stack)}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: compact
            ? {
                maxHeight: 'min(72dvh, calc(100dvh - var(--safe-top) - 16px))',
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
              }
            : { width: 400 },
        },
      }}
    >
      {stack && (
        <Box sx={{ p: 2, pb: 3 }}>
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}
          >
            <Box>
              <Typography variant="h6">{address || 'This spot'}</Typography>
              <Typography variant="body2" color="text.secondary">
                {stack.length} listings share this address
              </Typography>
            </Box>
            <IconButton onClick={onClose} aria-label="Close" edge="end">
              <CloseIcon />
            </IconButton>
          </Stack>

          {/*
            * The pin is the intersection, not the plot. Saying so here is the
            * same caveat the detail panel gives, at the moment it explains why
            * there is a list at all rather than one place.
            */}
          <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 1 }}>
            The pin marks the address, not the plot — these are spread along it.
          </Typography>

          <List sx={{ mt: 1 }}>
            {stack.map((poi) => (
              <ListItemButton key={poi.uid} onClick={() => onChoose(poi)} sx={{ borderRadius: 1 }}>
                <Box sx={{ display: 'flex', mr: 1.5, color: 'text.secondary' }}>
                  {poi.kind === 'art' ? (
                    <PaletteIcon fontSize="small" />
                  ) : (
                    <LocalActivityIcon fontSize="small" />
                  )}
                </Box>
                <ListItemText primary={poi.name} secondary={poi.subtitle} />
              </ListItemButton>
            ))}
          </List>
        </Box>
      )}
    </Drawer>
  )
}
