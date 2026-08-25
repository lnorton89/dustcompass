import { useMemo, useState } from 'react'
import {
  Autocomplete,
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import DirectionsBikeIcon from '@mui/icons-material/DirectionsBike'
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk'
import MyLocationIcon from '@mui/icons-material/MyLocation'
import SwapVertIcon from '@mui/icons-material/SwapVert'
import type { CityLayout } from '../brc/layout'
import { geocode } from '../brc/geocode'
import type { Poi } from '../data/types'
import type { SavedPlace } from '../data/useSavedPlaces'
import type { DirectionsEndpoint, DirectionsMode } from '../data/directions'
import { directionsEndpointLabel } from '../data/directionsRuntime'

interface EndpointOption {
  key: string
  label: string
  detail: string
  endpoint: DirectionsEndpoint
}

interface Props {
  open: boolean
  compact: boolean
  layout: CityLayout
  pois: readonly Poi[]
  places: readonly SavedPlace[]
  from: DirectionsEndpoint
  to?: DirectionsEndpoint
  mode: DirectionsMode
  hasUsableLiveFix: boolean
  findingLocation: boolean
  onFromChange: (endpoint: DirectionsEndpoint) => void
  onToChange: (endpoint: DirectionsEndpoint | undefined) => void
  onModeChange: (mode: DirectionsMode) => void
  onSwap: () => void
  onStart: () => void
  onShare: () => void
  onClose: () => void
}

function optionKey(endpoint: DirectionsEndpoint): string {
  switch (endpoint.kind) {
    case 'live': return 'live'
    case 'man': return 'man'
    case 'poi': return `poi:${endpoint.uid}`
    case 'address': return `address:${endpoint.address}`
    case 'fixed': return `fixed:${endpoint.label}:${endpoint.position.join(',')}`
  }
}

function baseOptions(
  pois: readonly Poi[],
  places: readonly SavedPlace[],
  allowLive: boolean,
): EndpointOption[] {
  const options: EndpointOption[] = [
    {
      key: 'live',
      label: 'Your location',
      detail: allowLive ? 'Uses your current on-playa GPS fix' : 'Available when an on-playa GPS fix is ready',
      endpoint: { kind: 'live' },
    },
    { key: 'man', label: 'The Man', detail: 'Black Rock City center', endpoint: { kind: 'man' } },
  ]

  for (const place of places) {
    options.push({
      key: `saved:${place.id}`,
      label: place.name,
      detail: `Saved · ${place.address}`,
      endpoint: { kind: 'fixed', label: place.name, position: place.position },
    })
  }

  for (const poi of pois) {
    options.push({
      key: `poi:${poi.uid}`,
      label: poi.name,
      detail: [poi.address, poi.subtitle].filter(Boolean).join(' · '),
      endpoint: { kind: 'poi', uid: poi.uid },
    })
  }

  return options
}

function EndpointPicker({
  label,
  value,
  options,
  layout,
  pois,
  disableLive,
  onChange,
}: {
  label: string
  value?: DirectionsEndpoint
  options: readonly EndpointOption[]
  layout: CityLayout
  pois: readonly Poi[]
  disableLive: boolean
  onChange: (endpoint: DirectionsEndpoint | undefined) => void
}) {
  const [query, setQuery] = useState('')
  const dynamicOptions = useMemo(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) return options
    const result = geocode(trimmed, layout)
    if (!result) return options
    const address: EndpointOption = {
      key: `address:${result.label}`,
      label: result.label,
      detail: 'Playa address',
      endpoint: { kind: 'address', address: result.label, position: result.position },
    }
    return [address, ...options]
  }, [layout, options, query])

  const selected = value
    ? dynamicOptions.find((option) => optionKey(option.endpoint) === optionKey(value)) ?? {
        key: optionKey(value),
        label: directionsEndpointLabel(value, pois),
        detail: '',
        endpoint: value,
      }
    : null

  return (
    <Autocomplete
      options={dynamicOptions}
      value={selected}
      inputValue={query}
      onInputChange={(_, next) => setQuery(next)}
      getOptionLabel={(option) => option.label}
      getOptionDisabled={(option) => disableLive && option.endpoint.kind === 'live'}
      isOptionEqualToValue={(a, b) => a.key === b.key}
      filterOptions={(items, state) => {
        const term = state.inputValue.trim().toLowerCase()
        if (!term) return items.slice(0, 40)
        return items
          .filter((option) => `${option.label} ${option.detail}`.toLowerCase().includes(term))
          .slice(0, 40)
      }}
      onChange={(_, option) => {
        onChange(option?.endpoint)
        setQuery('')
      }}
      renderInput={(params) => <TextField {...params} label={label} size="small" />}
      renderOption={(props, option) => (
        <Box component="li" {...props} key={option.key}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" noWrap>{option.label}</Typography>
            <Typography variant="caption" color="text.secondary" noWrap>{option.detail}</Typography>
          </Box>
        </Box>
      )}
    />
  )
}

export function DirectionsPanel({
  open,
  compact,
  layout,
  pois,
  places,
  from,
  to,
  mode,
  hasUsableLiveFix,
  findingLocation,
  onFromChange,
  onToChange,
  onModeChange,
  onSwap,
  onStart,
  onShare,
  onClose,
}: Props) {
  const options = useMemo(
    () => baseOptions(pois, places, hasUsableLiveFix),
    [pois, places, hasUsableLiveFix],
  )
  const fromLabel = directionsEndpointLabel(from, pois)
  const canStart = Boolean(to) && (from.kind !== 'live' || hasUsableLiveFix)

  const content = (
    <Stack spacing={1.5} sx={{ p: 2, width: compact ? 'auto' : 390, maxWidth: '100vw' }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6">Directions</Typography>
          <Typography variant="caption" color="text.secondary">
            Plan point-to-point travel without leaving the offline map.
          </Typography>
        </Box>
        <IconButton aria-label="Close directions" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Stack spacing={1} sx={{ flex: 1, minWidth: 0 }}>
          <EndpointPicker
            label="From"
            value={from}
            options={options}
            layout={layout}
            pois={pois}
            disableLive={!hasUsableLiveFix}
            onChange={(endpoint) => endpoint && onFromChange(endpoint)}
          />
          <EndpointPicker
            label="To"
            value={to}
            options={options}
            layout={layout}
            pois={pois}
            disableLive={!hasUsableLiveFix}
            onChange={onToChange}
          />
        </Stack>
        <IconButton aria-label="Swap directions endpoints" onClick={onSwap} disabled={!to}>
          <SwapVertIcon />
        </IconButton>
      </Stack>

      {from.kind === 'live' && (
        <Paper variant="outlined" sx={{ px: 1.25, py: 1 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <MyLocationIcon fontSize="small" color={hasUsableLiveFix ? 'primary' : 'disabled'} />
            <Typography variant="body2" color="text.secondary">
              {hasUsableLiveFix
                ? `${fromLabel} follows your live GPS position.`
                : findingLocation
                  ? 'Finding your location… You can choose a destination while GPS starts.'
                  : 'Your location is unavailable here. Choose The Man or another fixed start.'}
            </Typography>
          </Stack>
        </Paper>
      )}

      <ToggleButtonGroup
        exclusive
        fullWidth
        size="small"
        value={mode}
        onChange={(_, value: DirectionsMode | null) => value && onModeChange(value)}
        aria-label="Travel mode"
      >
        <ToggleButton value="walk"><DirectionsWalkIcon fontSize="small" /> Walk</ToggleButton>
        <ToggleButton value="bike"><DirectionsBikeIcon fontSize="small" /> Bike</ToggleButton>
      </ToggleButtonGroup>

      <Divider />
      <Typography variant="caption" color="text.secondary">
        Until surveyed street routing is complete, guidance remains a straight-line bearing preview. Follow streets around occupied blocks.
      </Typography>

      <Stack direction="row" spacing={1}>
        <Button variant="outlined" fullWidth disabled={!to} onClick={onShare}>Share route</Button>
        <Button variant="contained" fullWidth disabled={!canStart} onClick={onStart}>Start</Button>
      </Stack>
    </Stack>
  )

  if (compact) {
    return (
      <Drawer
        anchor="bottom"
        open={open}
        onClose={onClose}
        ModalProps={{ disableRestoreFocus: true }}
        slotProps={{ paper: { sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16 } } }}
      >
        {content}
      </Drawer>
    )
  }

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      {content}
    </Drawer>
  )
}
