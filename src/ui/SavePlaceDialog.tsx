import { useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
  Chip,
} from '@mui/material'
import { MAX_SAVED_PLACE_NAME_LENGTH } from '../data/useSavedPlaces'

interface Props {
  open: boolean
  address: string
  onSave: (name: string) => void
  onClose: () => void
}

/**
 * The names people actually use are few and predictable, and typing on a dusty
 * phone in the dark is miserable, so the common ones are one tap.
 */
const SUGGESTIONS = ['My camp', 'My bike', 'My tent', 'Meeting point', 'Art car']

export function SavePlaceDialog({ open, address, onSave, onClose }: Props) {
  const [name, setName] = useState('')

  // Clearing on the way out, rather than in an effect on the way in: same
  // result, one render fewer, and no state cascade.
  const close = () => {
    setName('')
    onClose()
  }

  const save = (value: string) => {
    setName('')
    onSave(value)
  }

  const commit = () => {
    const trimmed = name.trim()
    if (trimmed) save(trimmed)
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
      <DialogTitle>Save this spot</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {address}
        </Typography>
        <TextField
          autoFocus
          fullWidth
          size="small"
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && commit()}
          slotProps={{ htmlInput: { maxLength: MAX_SAVED_PLACE_NAME_LENGTH } }}
          helperText={`${name.length}/${MAX_SAVED_PLACE_NAME_LENGTH}`}
          sx={{ mt: 1 }}
        />
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, mt: 2 }}>
          {SUGGESTIONS.map((suggestion) => (
            <Chip
              key={suggestion}
              label={suggestion}
              size="small"
              variant="outlined"
              onClick={() => save(suggestion)}
            />
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancel</Button>
        <Button variant="contained" onClick={commit} disabled={!name.trim()}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  )
}
