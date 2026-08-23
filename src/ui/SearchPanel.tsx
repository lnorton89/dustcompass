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
import type { Position } from '../brc/geo'

interface Props {
  layout: CityLayout
  pois: Poi[]
  onGo: (position: Position, poi?: Poi) => void
}

interface Option {
  label: string
  detail: string
  kind: 'address' | 'art' | 'camp'
  position: Position
  poi?: Poi
}

/**
 * One box for both "Bag o' Dicks" and "D & 3:15". Out here the address *is* the
 * search term as often as the name is, so splitting them into two fields would
 * be wrong.
 */
export function SearchPanel({ layout, pois, onGo }: Props) {
  const [query, setQuery] = useState('')

  const options = useMemo<Option[]>(() => {
    const term = query.trim().toLowerCase()
    if (term.length < 2) return []

    const results: Option[] = []

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
  }, [query, layout, pois])

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
              color={option.kind === 'address' ? 'default' : option.kind === 'art' ? 'primary' : 'secondary'}
              variant="outlined"
            />
          </ListItem>
        )
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder="Camp, art, or an address like 7:30 & Esplanade"
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
