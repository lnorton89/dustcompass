import { useMemo, useState, type RefObject } from 'react'
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
import type { ServiceCategory } from '../brc/services'
import type { Poi, UnplacedListing } from '../data/types'

/** Why a result cannot be gone to, said in the width of a result row. */
const LOCATION_PENDING: Record<UnplacedListing['reason'], string> = {
  embargoed: 'location not out yet',
  unpublished: 'no location published',
}
import type { SavedPlace } from '../data/useSavedPlaces'
import type { Position } from '../brc/geo'

interface Props {
  layout: CityLayout
  pois: Poi[]
  /** Listings with no location — findable by name, but nowhere to go. */
  unplaced: UnplacedListing[]
  places: SavedPlace[]
  onGo: (position: Position, poi?: Poi) => void
  /** Opens a listing that has no position, so `onGo` has nothing to move to. */
  onOpenUnplaced: (listing: UnplacedListing) => void
  /** So "/" can put the cursor here from anywhere on the page. */
  inputRef?: RefObject<HTMLInputElement | null>
  compact?: boolean
}

interface Option {
  label: string
  detail: string
  kind: 'address' | 'art' | 'camp' | 'service' | 'landmark' | 'saved'
  /** Only set for `kind: 'service'` results — which icon it earns. See optionIcon. */
  category?: ServiceCategory
  /** Absent for a listing that has no location to go to. */
  position?: Position
  poi?: Poi
  unplaced?: UnplacedListing
  score: number
}

/**
 * One box for both "Bag o' Dicks" and "D & 3:15". Out here the address *is* the
 * search term as often as the name is, so splitting them into two fields would
 * be wrong.
 */
export function SearchPanel({
  layout,
  pois,
  unplaced,
  places,
  onGo,
  onOpenUnplaced,
  inputRef,
  compact = false,
}: Props) {
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
          category: poi.category,
          position: poi.position,
          poi,
          score,
        })
      }
    }
    // Below the placed results on purpose: something you can walk to beats
    // something you can only read about. `- 15` keeps a strong name match on
    // an embargoed piece ahead of a weak address match on a camp.
    for (const listing of unplaced) {
      const score = matchScore(listing.name, term)
      if (score > 0) {
        results.push({
          label: listing.name,
          detail: [listing.subtitle, LOCATION_PENDING[listing.reason]].filter(Boolean).join(' · '),
          kind: listing.kind,
          unplaced: listing,
          score: score - 15,
        })
      }
    }

    return results.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)).slice(0, 40)
  }, [query, layout, pois, places, unplaced])

  return (
    <Autocomplete
      freeSolo
      options={options}
      filterOptions={(x) => x}
      inputValue={query}
      onInputChange={(_, value) => setQuery(value)}
      onChange={(_, value) => {
        if (!value) return
        // freeSolo hands back the raw text when Enter is pressed with no
        // suggestion highlighted — which is the common case for typing a
        // full address and submitting it, rather than pointer-selecting the
        // option the box generated for it. Geocode it directly rather than
        // silently doing nothing.
        if (typeof value === 'string') {
          const result = geocode(value, layout)
          if (result) onGo(result.position)
          return
        }
        if (value.unplaced) onOpenUnplaced(value.unplaced)
        else if (value.position) onGo(value.position, value.poi)
      }}
      getOptionLabel={(option) => (typeof option === 'string' ? option : option.label)}
      renderOption={(props, option) => {
        const { key, ...rest } = props as typeof props & { key: string }
        return (
          <ListItem key={key} {...rest} dense>
            <ListItemIcon sx={{ minWidth: 36, color: option.kind === 'art' ? 'primary.main' : option.kind === 'camp' ? 'secondary.main' : 'text.secondary' }}>
              {optionIcon(option)}
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
          inputRef={inputRef}
          // Stays `small`: the touch floor is applied to the field's box in the
          // theme, which buys the 44px without the 56px of bulk `medium` would
          // put across the top of a phone.
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

/**
 * A `service` result covers everything from Rampart to The Temple to the
 * airport — see `categorise()` in `brc/services.ts`. Only medical and ranger
 * stations are actually emergency infrastructure; showing the same hospital
 * cross on "The Temple" or "Box Office" was issue #43.
 */
// Exported for a focused unit test of the icon-selection logic (issue #43) —
// exercising it through the full Autocomplete would mean driving MUI's open
// state for no more signal than this gives directly.
export function optionIcon({ kind, category }: Pick<Option, 'kind' | 'category'>) {
  if (kind === 'art') return <AutoAwesomeIcon fontSize="small" />
  if (kind === 'camp') return <GroupsIcon fontSize="small" />
  if (kind === 'saved') return <StarIcon fontSize="small" />
  if (kind === 'service' && (category === 'medical' || category === 'ranger')) {
    return <LocalHospitalIcon fontSize="small" />
  }
  return <PlaceIcon fontSize="small" />
}
