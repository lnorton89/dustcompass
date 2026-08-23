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
import type { ReactElement } from 'react'
import type { SavedPlace } from '../data/useSavedPlaces'

export interface FilterOption<T extends string> {
  key: T
  label: string
  color: 'primary' | 'secondary' | 'default'
  icon?: ReactElement
}

interface Props<T extends string> {
  open: boolean
  options: FilterOption<T>[]
  active: Set<T>
  cityUp: boolean
  places: SavedPlace[]
  onToggle: (key: T) => void
  onToggleCityUp: () => void
  onGoToPlace: (place: SavedPlace) => void
  onRemovePlace: (id: string) => void
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
  active,
  cityUp,
  places,
  onToggle,
  onToggleCityUp,
  onGoToPlace,
  onRemovePlace,
  onClose,
}: Props<T>) {
  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      slotProps={{ paper: { sx: { maxHeight: '90dvh', borderTopLeftRadius: 16, borderTopRightRadius: 16, p: 2 } } }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="subtitle2">Show on the map</Typography>
        <IconButton size="small" onClick={onClose} aria-label="Close filters">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, mb: 1 }}>
        {options.map((option) => (
          <Chip
            key={option.key}
            icon={option.icon}
            label={option.label}
            color={option.color}
            variant={active.has(option.key) ? 'filled' : 'outlined'}
            onClick={() => onToggle(option.key)}
          />
        ))}
      </Stack>
      <Box sx={{ mt: 1 }}>
        <FormControlLabel
          control={<Switch checked={cityUp} onChange={onToggleCityUp} />}
          label="12:00 points up"
        />
      </Box>

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
                <IconButton
                  edge="end"
                  size="small"
                  aria-label={`Delete ${place.name}`}
                  onClick={() => onRemovePlace(place.id)}
                >
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
    </Drawer>
  )
}
