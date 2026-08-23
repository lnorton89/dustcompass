import {
  Chip,
  Drawer,
  Stack,
  Switch,
  FormControlLabel,
  Typography,
  Box,
} from '@mui/material'

export interface FilterOption<T extends string> {
  key: T
  label: string
  color: 'primary' | 'secondary' | 'default'
}

interface Props<T extends string> {
  open: boolean
  options: FilterOption<T>[]
  active: Set<T>
  cityUp: boolean
  onToggle: (key: T) => void
  onToggleCityUp: () => void
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
  onToggle,
  onToggleCityUp,
  onClose,
}: Props<T>) {
  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      slotProps={{ paper: { sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, p: 2 } } }}
    >
      <Typography variant="subtitle2" gutterBottom>
        Show on the map
      </Typography>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, mb: 1 }}>
        {options.map((option) => (
          <Chip
            key={option.key}
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
    </Drawer>
  )
}
