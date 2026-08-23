import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  AppBar,
  Box,
  Chip,
  CircularProgress,
  CssBaseline,
  Snackbar,
  Stack,
  ThemeProvider,
  ToggleButton,
  ToggleButtonGroup,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import LightModeIcon from '@mui/icons-material/LightMode'
import ExploreIcon from '@mui/icons-material/Explore'
import EventIcon from '@mui/icons-material/Event'
import type { MapRef } from '@vis.gl/react-maplibre'
import { MapView } from './map/MapView'
import { SearchPanel } from './ui/SearchPanel'
import { DetailDrawer } from './ui/DetailDrawer'
import { EventsPanel } from './ui/EventsPanel'
import { playaTheme } from './ui/theme'
import { useEventsByHost, usePlayaData } from './data/usePlayaData'
import { scheduleClock } from './data/events'
import { useFavorites } from './data/useFavorites'
import type { Poi, PoiKind } from './data/types'
import { reverseGeocode } from './brc/geocode'
import type { Position } from './brc/geo'

type Filter = PoiKind | 'toilets' | 'services' | 'favorites'

const FILTERS: { key: Filter; label: string; color: 'primary' | 'secondary' | 'default' }[] = [
  { key: 'art', label: 'Art', color: 'primary' },
  { key: 'camp', label: 'Camps', color: 'secondary' },
  { key: 'toilets', label: 'Toilets', color: 'default' },
  { key: 'services', label: 'Services', color: 'default' },
  { key: 'favorites', label: '★', color: 'primary' },
]

export default function App() {
  const { data, error } = usePlayaData()
  const { favorites, toggle: toggleFavorite } = useFavorites()
  const [mode, setMode] = useState<'dark' | 'light'>('dark')
  const [cityUp, setCityUp] = useState(true)
  const [active, setActive] = useState<Set<Filter>>(
    () => new Set<Filter>(['art', 'camp', 'toilets', 'services']),
  )
  const [selected, setSelected] = useState<Poi>()
  const [probe, setProbe] = useState<string>()
  const [here, setHere] = useState<Position>()
  const [eventsOpen, setEventsOpen] = useState(false)
  const [realNow, setRealNow] = useState(() => new Date())
  const clock = useMemo(() => scheduleClock(data?.range, realNow), [data?.range, realNow])
  const mapRef = useRef<MapRef>(null)
  const theme = useMemo(() => playaTheme(mode), [mode])
  const eventsByHost = useEventsByHost(data)

  // "On now" has to stay true as time passes, or the panel quietly lies.
  useEffect(() => {
    const id = setInterval(() => setRealNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const visiblePois = useMemo(() => {
    if (!data) return []
    return active.has('favorites') ? data.pois.filter((poi) => favorites.has(poi.uid)) : data.pois
  }, [data, active, favorites])

  const hostsByUid = useMemo(
    () => new Map((data?.pois ?? []).map((poi) => [poi.uid, poi])),
    [data],
  )

  const origin = here ?? (data?.layout.center.geometry.coordinates as Position | undefined)
  const originLabel = here
    ? data
      ? `you (${reverseGeocode(here, data.layout).label})`
      : 'you'
    : 'the Man'

  const flyTo = useCallback((position: Position, poi?: Poi) => {
    mapRef.current?.flyTo({ center: position, zoom: 16.5, duration: 900 })
    setSelected(poi)
  }, [])

  const toggleFilter = useCallback((key: Filter) => {
    setActive((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const toggleCityUp = useCallback(() => {
    setCityUp((current) => {
      const next = !current
      mapRef.current?.easeTo({ bearing: next ? (data?.layout.bearing ?? 45) : 0, duration: 600 })
      return next
    })
  }, [data])

  const kinds = useMemo(() => {
    const set = new Set<PoiKind>()
    if (active.has('art')) set.add('art')
    if (active.has('camp')) set.add('camp')
    return set
  }, [active])

  return (
    <ThemeProvider theme={theme} defaultMode={mode}>
      <CssBaseline />
      <Box sx={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column' }}>
        <AppBar position="static" color="default" elevation={0} enableColorOnDark>
          <Toolbar sx={{ gap: 2, flexWrap: 'wrap', minHeight: 64, py: 1 }}>
            <Typography variant="h6" sx={{ whiteSpace: 'nowrap' }}>
              Playa Map
            </Typography>

            <Box sx={{ flex: '1 1 240px', maxWidth: 480 }}>
              {data && <SearchPanel layout={data.layout} pois={data.pois} onGo={flyTo} />}
            </Box>

            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: 'center', ml: 'auto', flexWrap: 'wrap' }}
            >
              {FILTERS.map((filter) => (
                <Chip
                  key={filter.key}
                  label={filter.label}
                  size="small"
                  color={filter.color}
                  variant={active.has(filter.key) ? 'filled' : 'outlined'}
                  onClick={() => toggleFilter(filter.key)}
                />
              ))}
              <Tooltip title="Events">
                <ToggleButton
                  value="events"
                  size="small"
                  selected={eventsOpen}
                  onChange={() => setEventsOpen((open) => !open)}
                  aria-label="Show events"
                >
                  <EventIcon fontSize="small" />
                </ToggleButton>
              </Tooltip>
              <Tooltip title={cityUp ? '12:00 is up' : 'North is up'}>
                <ToggleButton
                  value="cityUp"
                  size="small"
                  selected={cityUp}
                  onChange={toggleCityUp}
                  aria-label="Orient the map so 12:00 points up"
                >
                  <ExploreIcon fontSize="small" />
                </ToggleButton>
              </Tooltip>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={mode}
                onChange={(_, value) => value && setMode(value)}
              >
                <ToggleButton value="dark" aria-label="Dark mode">
                  <DarkModeIcon fontSize="small" />
                </ToggleButton>
                <ToggleButton value="light" aria-label="Light mode">
                  <LightModeIcon fontSize="small" />
                </ToggleButton>
              </ToggleButtonGroup>
            </Stack>
          </Toolbar>
        </AppBar>

        <Box sx={{ position: 'relative', flex: 1 }}>
          {error && (
            <Alert severity="error" sx={{ m: 2 }}>
              {error.message} — run <code>npm run fetch-data</code> first.
            </Alert>
          )}
          {!data && !error && (
            <Stack sx={{ height: '100%', alignItems: 'center', justifyContent: 'center' }}>
              <CircularProgress />
            </Stack>
          )}
          {data && (
            <>
              <MapView
                data={{ ...data, pois: visiblePois }}
                mode={mode}
                visible={kinds}
                showServices={active.has('services')}
                showToilets={active.has('toilets')}
                cityUp={cityUp}
                mapRef={mapRef}
                onSelect={setSelected}
                onProbe={(address) => setProbe(address)}
                onLocate={setHere}
              />
              {!data.embargo.artReleased && (
                <Alert
                  severity="info"
                  sx={{ position: 'absolute', top: 12, left: 12, maxWidth: 360 }}
                >
                  Art locations are embargoed until Gates open. Listings are shown without
                  positions.
                </Alert>
              )}
            </>
          )}
        </Box>
      </Box>

      {data && (
        <EventsPanel
          open={eventsOpen}
          events={data.events}
          hosts={hostsByUid}
          now={clock.now}
          preview={clock.preview}
          onSelect={(poi) => {
            setEventsOpen(false)
            flyTo(poi.position, poi)
          }}
          onClose={() => setEventsOpen(false)}
        />
      )}

      <DetailDrawer
        poi={selected}
        events={selected ? (eventsByHost.get(selected.uid) ?? []) : []}
        origin={origin ?? [0, 0]}
        originLabel={originLabel}
        isFavorite={selected ? favorites.has(selected.uid) : false}
        onToggleFavorite={toggleFavorite}
        onClose={() => setSelected(undefined)}
      />

      <Snackbar
        open={Boolean(probe)}
        autoHideDuration={4000}
        onClose={() => setProbe(undefined)}
        message={probe}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </ThemeProvider>
  )
}
