import { useMemo, useState } from 'react'
import {
  Autocomplete, Box, Button, Divider, Drawer, IconButton, Paper, Stack, TextField,
  ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import DirectionsBikeIcon from '@mui/icons-material/DirectionsBike'
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk'
import ImageIcon from '@mui/icons-material/Image'
import LinkIcon from '@mui/icons-material/Link'
import MyLocationIcon from '@mui/icons-material/MyLocation'
import SwapVertIcon from '@mui/icons-material/SwapVert'
import type { CityLayout } from '../brc/layout'
import { geocode } from '../brc/geocode'
import { formatDistance, formatMinutes, type Travel } from '../brc/travel'
import type { PlayaRoute } from '../brc/routing'
import type { EventItem, Poi } from '../data/types'
import { resolveEventLocation } from '../data/events'
import type { SavedPlace } from '../data/useSavedPlaces'
import type { DirectionsEndpoint, DirectionsMode } from '../data/directions'
import { directionsEndpointLabel } from '../data/directionsRuntime'

interface EndpointOption { key: string; label: string; detail: string; endpoint: DirectionsEndpoint }
export interface DirectionsPreview { fromLabel: string; toLabel: string; toDetail?: string; route: PlayaRoute; travel: Travel; heading: string }
interface Props {
  open: boolean; compact: boolean; layout: CityLayout; pois: readonly Poi[]; events: readonly EventItem[];
  places: readonly SavedPlace[]; droppedPin?: { position: [number, number]; address: string };
  from: DirectionsEndpoint; to?: DirectionsEndpoint; mode: DirectionsMode; hasUsableLiveFix: boolean;
  findingLocation: boolean; preview?: DirectionsPreview;
  onFromChange: (endpoint: DirectionsEndpoint) => void; onToChange: (endpoint: DirectionsEndpoint | undefined) => void;
  onModeChange: (mode: DirectionsMode) => void; onSwap: () => void; onStart: () => void; onShare: () => void;
  onShareImage: () => void; onClose: () => void;
}

function optionKey(endpoint: DirectionsEndpoint): string {
  switch (endpoint.kind) {
    case 'live': return 'live'; case 'man': return 'man'; case 'poi': return `poi:${endpoint.uid}`
    case 'address': return `address:${endpoint.address}`
    case 'fixed': return `fixed:${endpoint.label}:${endpoint.position.join(',')}`
  }
}

function baseOptions(pois: readonly Poi[], events: readonly EventItem[], places: readonly SavedPlace[], droppedPin: Props['droppedPin'], allowLive: boolean, layout: CityLayout): EndpointOption[] {
  const options: EndpointOption[] = [
    { key: 'live', label: 'Your location', detail: allowLive ? 'Uses your current on-playa GPS fix' : 'Available when an on-playa GPS fix is ready', endpoint: { kind: 'live' } },
    { key: 'man', label: 'The Man', detail: 'Black Rock City center', endpoint: { kind: 'man' } },
  ]
  if (droppedPin) options.push({ key: 'dropped-pin', label: 'Dropped pin', detail: droppedPin.address, endpoint: { kind: 'address', address: droppedPin.address, position: droppedPin.position } })
  for (const place of places) options.push({ key: `saved:${place.id}`, label: place.name, detail: `Saved · ${place.address}`, endpoint: { kind: 'fixed', label: place.name, position: place.position } })

  const byUid = new Map(pois.map((poi) => [poi.uid, poi] as const))
  for (const event of events) {
    const host = byUid.get(event.hosted_by_camp ?? event.located_at_art ?? '')
    const location = resolveEventLocation(event, host, layout)
    if (location.kind === 'host') {
      options.push({ key: `event:${event.uid}`, label: event.title, detail: `Event at ${location.poi.name}${location.poi.address ? ` · ${location.poi.address}` : ''}`, endpoint: { kind: 'poi', uid: location.poi.uid } })
    } else if (location.kind === 'geocoded') {
      options.push({ key: `event:${event.uid}`, label: event.title, detail: `Event at ${location.label}`, endpoint: { kind: 'address', address: location.label, position: location.position } })
    }
  }
  for (const poi of pois) options.push({ key: `poi:${poi.uid}`, label: poi.name, detail: [poi.address, poi.subtitle].filter(Boolean).join(' · '), endpoint: { kind: 'poi', uid: poi.uid } })
  return options
}

function EndpointPicker({ label, value, options, layout, pois, disableLive, clearable = true, onChange }: { label: string; value?: DirectionsEndpoint; options: readonly EndpointOption[]; layout: CityLayout; pois: readonly Poi[]; disableLive: boolean; clearable?: boolean; onChange: (endpoint: DirectionsEndpoint | undefined) => void }) {
  const [query, setQuery] = useState('')
  const dynamicOptions = useMemo(() => {
    const trimmed = query.trim(); if (trimmed.length < 2) return options
    const result = geocode(trimmed, layout); if (!result) return options
    return [{ key: `address:${result.label}`, label: result.label, detail: 'Playa address', endpoint: { kind: 'address' as const, address: result.label, position: result.position } }, ...options]
  }, [layout, options, query])
  const selected = value ? dynamicOptions.find((option) => option.key === optionKey(value)) ?? dynamicOptions.find((option) => optionKey(option.endpoint) === optionKey(value)) ?? { key: optionKey(value), label: directionsEndpointLabel(value, pois), detail: '', endpoint: value } : null
  return <Autocomplete key={value ? optionKey(value) : 'empty'} options={dynamicOptions} value={selected}
    autoHighlight disableClearable={!clearable}
    onInputChange={(_, next, reason) => setQuery(reason === 'input' ? next : '')} getOptionLabel={(option) => option.label}
    getOptionDisabled={(option) => disableLive && option.endpoint.kind === 'live'} isOptionEqualToValue={(a, b) => a.key === b.key}
    filterOptions={(items, state) => {
      const raw = state.inputValue.trim()
      if (!raw) return items.slice(0, 40)
      const term = raw.toLowerCase()
      const geocoded = geocode(raw, layout)
      const canonicalKey = geocoded ? `address:${geocoded.label}` : undefined
      return items.filter((option) => option.key === canonicalKey || `${option.label} ${option.detail}`.toLowerCase().includes(term)).slice(0, 40)
    }}
    onChange={(_, option) => onChange(option?.endpoint)} renderInput={(params) => <TextField {...params} label={label} size="small" />}
    renderOption={(props, option) => <Box component="li" {...props} key={option.key}><Box sx={{ minWidth: 0 }}><Typography variant="body2" noWrap>{option.label}</Typography><Typography variant="caption" color="text.secondary" noWrap>{option.detail}</Typography></Box></Box>} />
}

function routeSemantics(kind: PlayaRoute['kind']): string {
  if (kind === 'street') return 'Surveyed street route around occupied blocks.'
  if (kind === 'hybrid') return 'Surveyed streets plus a direct open-playa leg.'
  return 'Straight-line bearing guidance — verify a walkable path around occupied blocks.'
}

export function DirectionsPanel({ open, compact, layout, pois, events, places, droppedPin, from, to, mode, hasUsableLiveFix, findingLocation, preview, onFromChange, onToChange, onModeChange, onSwap, onStart, onShare, onShareImage, onClose }: Props) {
  const options = useMemo(() => baseOptions(pois, events, places, droppedPin, hasUsableLiveFix, layout), [pois, events, places, droppedPin, hasUsableLiveFix, layout])
  const fromLabel = directionsEndpointLabel(from, pois)
  const canStart = Boolean(to && preview) && (from.kind !== 'live' || hasUsableLiveFix)
  const eta = preview ? mode === 'walk' ? preview.travel.walkMinutes : preview.travel.bikeMinutes : undefined
  const canSwap = Boolean(to) && from.kind !== 'live'
  const content = <Stack spacing={1.5} sx={{ p: 2, width: compact ? 'auto' : 410, maxWidth: '100vw' }}>
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><Box sx={{ flex: 1, minWidth: 0 }}><Typography variant="h6">Directions</Typography><Typography variant="caption" color="text.secondary">Point-to-point planning stays on this device and works offline.</Typography></Box><IconButton aria-label="Close directions" onClick={onClose}><CloseIcon /></IconButton></Stack>
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><Stack spacing={1} sx={{ flex: 1, minWidth: 0 }}>
      <EndpointPicker label="From" value={from} options={options} layout={layout} pois={pois} disableLive={!hasUsableLiveFix && !findingLocation} clearable={false} onChange={(endpoint) => endpoint && onFromChange(endpoint)} />
      <EndpointPicker label="To" value={to} options={options} layout={layout} pois={pois} disableLive onChange={onToChange} />
    </Stack><IconButton aria-label="Swap directions endpoints" onClick={onSwap} disabled={!canSwap} title={from.kind === 'live' ? 'Choose a fixed start before swapping; Your location is an origin only' : undefined}><SwapVertIcon /></IconButton></Stack>
    {from.kind === 'live' && <Paper variant="outlined" sx={{ px: 1.25, py: 1 }}><Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><MyLocationIcon fontSize="small" color={hasUsableLiveFix ? 'primary' : 'disabled'} /><Typography variant="body2" color="text.secondary">{hasUsableLiveFix ? `${fromLabel} follows your live GPS position.` : findingLocation ? 'Finding your location… You can choose a destination while GPS starts.' : 'Your location is unavailable here. Choose The Man or another fixed start.'}</Typography></Stack></Paper>}
    <ToggleButtonGroup exclusive fullWidth size="small" value={mode} onChange={(_, value: DirectionsMode | null) => value && onModeChange(value)} aria-label="Travel mode"><ToggleButton value="walk"><DirectionsWalkIcon fontSize="small" /> Walk</ToggleButton><ToggleButton value="bike"><DirectionsBikeIcon fontSize="small" /> Bike</ToggleButton></ToggleButtonGroup>
    {preview && eta !== undefined && <Paper variant="outlined" data-testid="directions-summary" sx={{ p: 1.5 }}><Stack spacing={0.75}><Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', justifyContent: 'space-between' }}><Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{formatDistance(preview.travel)}</Typography><Typography variant="h6" color="primary.main">{formatMinutes(eta)}</Typography></Stack><Typography variant="body2" sx={{ fontWeight: 600 }}>{mode === 'walk' ? 'Walk' : 'Bike'} · head toward {preview.heading}</Typography><Typography variant="caption" color="text.secondary">{routeSemantics(preview.route.kind)}</Typography><Divider /><Typography variant="caption" color="text.secondary">Start: {preview.fromLabel}</Typography><Typography variant="caption" color="text.secondary">{preview.route.kind === 'direct' ? `Continue toward ${preview.heading} using bearing guidance.` : preview.route.kind === 'hybrid' ? 'Use surveyed streets around occupied blocks, then continue across open playa.' : 'Use the surveyed radial and annular streets around occupied blocks.'}</Typography><Typography variant="caption" color="text.secondary">Arrive: {preview.toDetail ?? preview.toLabel}</Typography></Stack></Paper>}
    {!preview && to && from.kind !== 'live' && <Typography variant="caption" color="warning.main">One of these endpoints cannot be resolved against the current map data.</Typography>}
    <Stack direction="row" spacing={1}><Button startIcon={<LinkIcon />} variant="outlined" fullWidth disabled={!to} onClick={onShare}>Share link</Button><Button startIcon={<ImageIcon />} variant="outlined" fullWidth disabled={!preview} onClick={onShareImage}>Route card</Button></Stack>
    <Button variant="contained" fullWidth disabled={!canStart} onClick={onStart}>Start navigation</Button>
  </Stack>
  return compact ? <Drawer anchor="bottom" open={open} onClose={onClose} ModalProps={{ disableRestoreFocus: true }} slotProps={{ paper: { sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16 } } }}>{content}</Drawer> : <Drawer anchor="right" open={open} onClose={onClose}>{content}</Drawer>
}
