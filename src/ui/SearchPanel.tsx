import { useMemo, useState } from 'react'
import {
  Autocomplete,
  Chip,
  InputAdornment,
  ListItem,
  ListItemText,
  TextField,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import type { CityLayout } from '../brc/layout'
import { geocode } from '../brc/geocode'
import type { Poi } from '../data/types'
import type { SavedPlace } from '../data/useSavedPlaces'
import type { Position } from '../brc/geo'

interface Props {
  layout: CityLayout
  pois: Poi[]
  places: SavedPlace[]
  onGo: (position: Position, poi?: Poi) => void
  compact?: boolean
}

interface Option {
  label: string
  detail: string
  kind: 'address' | 'art' | 'camp' | 'saved'
  position: Position
  poi?: Poi
}

/**
 * One box for both "Bag o' Dicks" and "D & 3:15". Out here the address *is* the
 * search term as often as the name is, so splitting them into two fields would
 * be wrong.
 */
export function SearchPanel({ layout, pois, places, onGo, compact = false }: Props) {
  const [query, setQuery] = useState('')

  const options = useMemo<Option[]>(() => {
    const term = query.trim().toLowerCase()
    if (term.length < 2) return []

    const results: Option[] = []

    // Saved spots first: if you are searching at 4am, this is what you want.
    for (const place of places) {
      if (place.name.toLowerCase().includes(term)) {
        results.push({
          label: place.name,
          detail: place.address,
          kind: 'saved',
          position: place.position,
        })
      }
    }

    const located = geocode(query, layout)
    if (located) {
      results.push({
        label: located.label,
        detail: `${Math.round(located.distanceFeet)} ft from the Man`,
        kind: 'address',
        position: located.position,
      })
    }

    for (const poi of pois) {
      if (results.length > 40) break
      if (poi.name.toLowerCase().includes(term)) {
        results.push({
          label: poi.name,
          detail: poi.address ?? '',
          kind: poi.kind === 'art' ? 'art' : 'camp',
          position: poi.position,
          poi,
        })
      }
    }
    return results
  }, [query, layout, pois, places])

  return (
    <Autocomplete
      freeSolo
      options={options}
      filterOptions={(x) => x}
      inputValue={query}
      onInputChange={(_, value) => setQuery(value)}
      onChange={(_, value) => {
        if (value && typeof value !== 'string') onGo(value.position, value.poi)
      }}
      getOptionLabel={(option) => (typeof option === 'string' ? option : option.label)}
      renderOption={(props, option) => {
        const { key, ...rest } = props as typeof props & { key: string }
        return (
          <ListItem key={key} {...rest} dense>
            <ListItemText primary={option.label} secondary={option.detail} />
            <Chip
              size="small"
              label={option.kind}
              color={
                option.kind === 'art'
                  ? 'primary'
                  : option.kind === 'camp'
                    ? 'secondary'
                    : 'default'
              }
              variant="outlined"
            />
          </ListItem>
        )
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder={compact ? 'Search the playa' : 'Camp, art, or an address like 7:30 & Esplanade'}
          size="small"
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps.input,
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
      )}
      sx={{ width: '100%' }}
    />
  )
}
