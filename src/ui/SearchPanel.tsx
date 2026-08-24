import { useMemo, useState } from 'react'
import {
  Autocomplete,
  Chip,
  InputAdornment,
  ListItem,
  ListItemIcon,
  ListItemText,
  TextField,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import GroupsIcon from '@mui/icons-material/Groups'
import PlaceIcon from '@mui/icons-material/Place'
import StarIcon from '@mui/icons-material/Star'
import LocalHospitalIcon from '@mui/icons-material/LocalHospital'
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
  kind: 'address' | 'art' | 'camp' | 'service' | 'landmark' | 'saved'
  position: Position
  poi?: Poi
  score: number
}

/**
 * One box for both "Bag o' Dicks" and "D & 3:15". Out here the address *is* the
 * search term as often as the name is, so splitting them into two fields would
 * be wrong.
 */
export function SearchPanel({ layout, pois, places, onGo, compact = false }: Props) {
  const [query, setQuery] = useState('')

  const options = useMemo<Option[]>(() => {
    const term = normalize(query)
    if (term.length < 2) return []

    const results: Option[] = []

    // Saved spots first: if you are searching at 4am, this is what you want.
    for (const place of places) {
      const score = matchScore(place.name, term)
      if (score > 0) {
        results.push({
          label: place.name,
          detail: place.address,
          kind: 'saved',
          position: place.position,
          score: score + 50,
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
        score: 85,
      })
    }

    for (const poi of pois) {
      // Forty banks of toilets all answer to "Toilets", so as search results
      // they are forty ways of saying nothing. The map has a switch for them,
      // and out there you want the nearest one, not a list.
      if (poi.category === 'toilet') continue
      const score = Math.max(matchScore(poi.name, term), matchScore(poi.address ?? '', term) - 20)
      if (score > 0) {
        results.push({
          label: poi.name,
          detail: poi.subtitle ? [poi.subtitle, poi.address].filter(Boolean).join(' · ') : (poi.address ?? ''),
          kind: optionKind(poi.kind),
          position: poi.position,
          poi,
          score,
        })
      }
    }
    return results.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)).slice(0, 40)
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
            <ListItemIcon sx={{ minWidth: 36, color: option.kind === 'art' ? 'primary.main' : option.kind === 'camp' ? 'secondary.main' : 'text.secondary' }}>
              {optionIcon(option.kind)}
            </ListItemIcon>
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

function normalize(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
}

function matchScore(value: string, term: string) {
  const candidate = normalize(value)
  if (!candidate || !term) return 0
  if (candidate === term) return 120
  if (candidate.startsWith(term)) return 105
  if (candidate.split(/\s+/).some((word) => word.startsWith(term))) return 92
  if (candidate.includes(term)) return 70
  return 0
}

function optionKind(kind: Poi['kind']): Option['kind'] {
  if (kind === 'art' || kind === 'service' || kind === 'landmark') return kind
  return 'camp'
}

function optionIcon(kind: Option['kind']) {
  if (kind === 'art') return <AutoAwesomeIcon fontSize="small" />
  if (kind === 'camp') return <GroupsIcon fontSize="small" />
  if (kind === 'saved') return <StarIcon fontSize="small" />
  if (kind === 'service') return <LocalHospitalIcon fontSize="small" />
  return <PlaceIcon fontSize="small" />
}
