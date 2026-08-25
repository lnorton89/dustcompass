import {
  Box,
  Chip,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Stack,
  Switch,
  Typography,
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import CloseIcon from '@mui/icons-material/Close'
import WcIcon from '@mui/icons-material/Wc'
import LocalHospitalIcon from '@mui/icons-material/LocalHospital'
import ShieldIcon from '@mui/icons-material/Shield'
import { alpha } from '@mui/material/styles'
import type { ReactElement } from 'react'
import type { ServiceCategory } from '../brc/services'
import type { SavedPlace } from '../data/useSavedPlaces'
import type { PlayaPalette, ReadingSize } from '../map/style'
import { BRAND } from '../brand'

/** The three categories worth a one-tap "nearest" lookup (#66) — the ones someone actually needs in a hurry. */
const NEARBY: { category: ServiceCategory; label: string; icon: ReactElement }[] = [
  { category: 'toilet', label: 'Nearest toilet', icon: <WcIcon fontSize="small" /> },
  { category: 'ranger', label: 'Nearest ranger', icon: <ShieldIcon fontSize="small" /> },
  { category: 'medical', label: 'Nearest medical', icon: <LocalHospitalIcon fontSize="small" /> },
]

export interface FilterOption<T extends string> {
  key: T
  label: string
  /** Which of the map's own colours this layer is drawn in. */
  accent: keyof PlayaPalette
  icon?: ReactElement
}

interface Props<T extends string> {
  open: boolean
  options: FilterOption<T>[]
  palette: PlayaPalette
  active: Set<T>
  cityUp: boolean
  /** Whether the reader has asked for bigger text on the map and in the UI. */
  reading: ReadingSize
  places: SavedPlace[]
  onToggle: (key: T) => void
  onToggleCityUp: () => void
  onToggleReading: () => void
  onGoToPlace: (place: SavedPlace) => void
  onRemovePlace: (id: string) => void
  /** One-tap "nearest toilet/ranger/medical" (#66) — the shared GPS position answers it locally, no routing backend needed. */
  onFindNearest: (category: ServiceCategory) => void
  onClose: () => void
}

/**
 * On a phone the filters do not fit beside the search box, and squeezing them
 * into a third toolbar row costs a sixth of the screen. They live in a sheet
 * that comes up from the bottom, where a thumb already is.
 */
export function FilterSheet<T extends string>({
  open,
  options,
  palette,
  active,
  cityUp,
  reading,
  places,
  onToggle,
  onToggleCityUp,
  onToggleReading,
  onGoToPlace,
  onRemovePlace,
  onFindNearest,
  onClose,
}: Props<T>) {
  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            maxHeight: '90dvh',
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            maxWidth: { sm: 560 },
            mx: 'auto',
            p: 2,
            pb: 'calc(16px + var(--safe-bottom))',
          },
        },
      }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="subtitle2">Show on the map</Typography>
        <IconButton size="small" onClick={onClose} aria-label="Close filters">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, mb: 1 }}>
        {options.map((option) => {
          const on = active.has(option.key)
          const accent = palette[option.accent]
          return (
            <Chip
              key={option.key}
              icon={option.icon}
              label={option.label}
              variant="outlined"
              onClick={() => onToggle(option.key)}
              sx={{
                height: 44,
                borderRadius: '12px',
                px: 0.5,
                fontSize: 14,
                fontWeight: 600,
                borderColor: on ? alpha(accent, 0.55) : 'divider',
                bgcolor: on ? alpha(accent, 0.14) : 'transparent',
                color: on ? 'text.primary' : 'text.secondary',
                '& .MuiChip-icon': {
                  fontSize: 19,
                  color: on ? accent : 'inherit',
                  opacity: on ? 1 : 0.7,
                },
                '&:hover': { bgcolor: on ? alpha(accent, 0.2) : 'action.hover' },
              }}
            />
          )
        })}
      </Stack>
      <Box sx={{ mt: 1 }}>
        <FormControlLabel control={<Switch checked={cityUp} onChange={onToggleCityUp} />} label="12:00 points up" />
      </Box>
      <Box>
        <FormControlLabel control={<Switch checked={reading === 'large'} onChange={onToggleReading} />} label="Bigger text and labels" />
      </Box>

      <Divider sx={{ my: 1.5 }} />
      <Typography variant="subtitle2">Nearby</Typography>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, mt: 1, mb: 1 }}>
        {NEARBY.map(({ category, label, icon }) => (
          <Chip
            key={category}
            icon={icon}
            label={label}
            variant="outlined"
            onClick={() => {
              onFindNearest(category)
              onClose()
            }}
            sx={{
              height: 44,
              borderRadius: '12px',
              px: 0.5,
              fontSize: 14,
              fontWeight: 600,
              borderColor: 'divider',
              color: 'text.primary',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          />
        ))}
      </Stack>

      <Divider sx={{ my: 1.5 }} />
      <Typography variant="subtitle2">Saved spots</Typography>
      {places.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
          Tap anywhere on the map to save where your camp or bike is.
        </Typography>
      ) : (
        <List dense disablePadding sx={{ maxHeight: 200, overflowY: 'auto' }}>
          {places.map((place) => (
            <ListItem
              key={place.id}
              disablePadding
              secondaryAction={
                <IconButton edge="end" size="small" aria-label={`Delete ${place.name}`} onClick={() => onRemovePlace(place.id)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              }
            >
              <ListItemButton onClick={() => onGoToPlace(place)}>
                <ListItemText primary={place.name} secondary={place.address} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      )}

      <Divider sx={{ my: 1.5 }} />
      <Typography variant="subtitle2">About this map</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
        City survey &amp; listings: Burning Man Project.
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        {BRAND.disclaimer}
      </Typography>
    </Drawer>
  )
}
