import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  CircularProgress,
  CssBaseline,
  Snackbar,
  Stack,
  ThemeProvider,
  ToggleButton,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material'
import { useMediaQuery } from '@mui/material'
import IconButton from '@mui/material/IconButton'
import TuneIcon from '@mui/icons-material/Tune'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import NightlightIcon from '@mui/icons-material/Nightlight'
import LightModeIcon from '@mui/icons-material/LightMode'
import ExploreIcon from '@mui/icons-material/Explore'
import EventIcon from '@mui/icons-material/Event'
import type { MapRef } from '@vis.gl/react-maplibre'
import { MapView } from './map/MapView'
import { SearchPanel } from './ui/SearchPanel'
import { DetailDrawer } from './ui/DetailDrawer'
import { EventsPanel } from './ui/EventsPanel'
import { FilterSheet } from './ui/FilterSheet'
import { NavBar } from './ui/NavBar'
import { playaTheme } from './ui/theme'
import { useEventsByHost, usePlayaData } from './data/usePlayaData'
import { scheduleClock } from './data/events'
import { useFavorites } from './data/useFavorites'
import { useGeolocation } from './data/useGeolocation'
import { useSavedPlaces } from './data/useSavedPlaces'
import { SavePlaceDialog } from './ui/SavePlaceDialog'
import { addressFor, deepLinkUrl, resolveDeepLink, useDeepLink } from './data/useDeepLink'
import { travelBetween } from './brc/travel'
import { bearingToClock, bearingBetween } from './brc/geo'
import { shareLink } from './ui/share'
import type { Poi, PoiKind } from './data/types'
import { reverseGeocode } from './brc/geocode'
import type { Position } from './brc/geo'
import type { ThemeMode } from './map/style'

type Filter = PoiKind | 'toilets' | 'services' | 'favorites'

/**
 * Dark → light → night red. Red is last because it is the deliberate choice,
 * not somewhere to land by accident.
 */
const NEXT_MODE: Record<ThemeMode, ThemeMode> = { dark: 'light', light: 'night', night: 'dark' }
const THEME_LABEL: Record<ThemeMode, string> = {
  dark: 'Switch to light mode',
  light: 'Switch to red night mode',
  night: 'Switch to dark mode',
}

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
  const { places, save: savePlace, remove: removePlace } = useSavedPlaces()
  const [saving, setSaving] = useState<{ position: Position; address: string }>()
  const [mode, setMode] = useState<ThemeMode>('dark')
  const [cityUp, setCityUp] = useState(true)
  const [active, setActive] = useState<Set<Filter>>(
    () => new Set<Filter>(['art', 'camp', 'toilets', 'services']),
  )
  const [selected, setSelected] = useState<Poi>()
  const [probe, setProbe] = useState<string>()
  // The map's own locate button and the "take me there" flow feed the same
  // watch, so a heading stays live however it was started.
  const location = useGeolocation()
  const [manualHere, setManualHere] = useState<Position>()
  const here = location.position ?? manualHere
  const [eventsOpen, setEventsOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [embargoNoticeSeen, setEmbargoNoticeSeen] = useState(false)
  const [realNow, setRealNow] = useState(() => new Date())
  const clock = useMemo(() => scheduleClock(data?.range, realNow), [data?.range, realNow])
  const mapRef = useRef<MapRef>(null)
  const theme = useMemo(() => playaTheme(mode), [mode])
  // Phones are the real target here; the desktop layout is the special case.
  const compact = useMediaQuery(theme.breakpoints.down('md'))
  const eventsByHost = useEventsByHost(data)
  const { initial: deepLink, publish } = useDeepLink()
  const [pin, setPin] = useState<{ position: Position; address: string }>()
  const [heading, setHeading] = useState<{ name: string; position: Position; address?: string }>()

  // "On now" has to stay true as time passes, or the panel quietly lies.
  useEffect(() => {
    const id = setInterval(() => setRealNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  /**
   * A shared link names either a listing or an address. Resolve it to a
   * position once and hand it to the map as its opening camera, so it is not
   * competing with the initial city framing.
   */
  const initialTarget = useMemo(() => {
    if (!data) return undefined
    if (deepLink.poi) {
      const target = data.pois.find((poi) => poi.uid === deepLink.poi)
      if (target) return target.position
    }
    return resolveDeepLink(deepLink, data.layout)
  }, [data, deepLink])

  // Applied during render rather than in an effect: React re-runs the component
  // before committing, so the restored selection is painted once instead of
  // flashing the unrestored view first.
  const [restoredLink, setRestoredLink] = useState<string | null>(null)
  const linkKey = deepLink.poi ?? deepLink.at ?? null
  if (data && initialTarget && linkKey && restoredLink !== linkKey) {
    setRestoredLink(linkKey)
    const target = data.pois.find((poi) => poi.uid === deepLink.poi)
    if (target) {
      setSelected(target)
    } else {
      setPin({
        position: initialTarget,
        address: deepLink.at ?? addressFor(initialTarget, data.layout),
      })
    }
  }

  // Keep the address bar in step with what is on screen, so the link in the
  // browser is always the one worth sharing.
  useEffect(() => {
    if (!data) return
    if (selected) publish({ poi: selected.uid })
    else if (pin) publish({ at: pin.address })
    else publish({})
  }, [data, selected, pin, publish])

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

  const navigation = useMemo(() => {
    if (!heading || !origin || !data) return undefined
    return {
      travel: travelBetween(origin, heading.position),
      clock: bearingToClock(data.layout, bearingBetween(origin, heading.position)),
    }
  }, [heading, origin, data])


  const flyTo = useCallback(
    (position: Position, poi?: Poi) => {
      mapRef.current?.flyTo({ center: position, zoom: 16.5, duration: 900 })
      setSelected(poi)
      if (!poi && data) setPin({ position, address: addressFor(position, data.layout) })
    },
    [data],
  )

  const share = useCallback(async (link: { poi?: string; at?: string }, title: string) => {
    const result = await shareLink(deepLinkUrl(link), title)
    if (result === 'copied') setProbe('Link copied')
    else if (result === 'unavailable') setProbe('Could not copy the link')
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
    <ThemeProvider theme={theme} defaultMode={mode === 'light' ? 'light' : 'dark'}>
      <CssBaseline />
      <Box sx={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column' }}>
        <AppBar position="static" color="default" elevation={0} enableColorOnDark>
          <Toolbar sx={{ gap: 1, minHeight: { xs: 56, md: 64 }, py: 1 }}>
            {!compact && (
              <Typography variant="h6" sx={{ whiteSpace: 'nowrap' }}>
                Playa Map
              </Typography>
            )}

            <Box sx={{ flex: '1 1 auto', minWidth: 0, maxWidth: { md: 480 } }}>
              {data && <SearchPanel layout={data.layout} pois={data.pois} places={places} onGo={flyTo} />}
            </Box>

            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: 'center', ml: 'auto', flexShrink: 0 }}
            >
              {!compact &&
                FILTERS.map((filter) => (
                  <Chip
                    key={filter.key}
                    label={filter.label}
                    size="small"
                    color={filter.color}
                    variant={active.has(filter.key) ? 'filled' : 'outlined'}
                    onClick={() => toggleFilter(filter.key)}
                  />
                ))}
              <IconButton
                size="small"
                onClick={() => setFiltersOpen(true)}
                aria-label="Filters and saved spots"
              >
                <TuneIcon fontSize="small" />
              </IconButton>
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
              {!compact && (
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
              )}
              <Tooltip title={THEME_LABEL[mode]}>
                <ToggleButton
                  value="theme"
                  size="small"
                  selected={mode === 'night'}
                  onChange={() => setMode(NEXT_MODE[mode])}
                  aria-label={THEME_LABEL[mode]}
                >
                  {mode === 'dark' ? (
                    <DarkModeIcon fontSize="small" />
                  ) : mode === 'light' ? (
                    <LightModeIcon fontSize="small" />
                  ) : (
                    <NightlightIcon fontSize="small" />
                  )}
                </ToggleButton>
              </Tooltip>
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
                onProbe={(address, position) => {
                  setProbe(address)
                  setPin({ position, address })
                }}
                onLocate={setManualHere}
                savedPlaces={places}
                onSelectPlace={(id) => {
                  const place = places.find((p) => p.id === id)
                  if (place) {
                    setHeading({ name: place.name, position: place.position, address: place.address })
                    location.start()
                  }
                }}
                pin={pin}
                initialTarget={initialTarget}
                route={heading && origin ? { from: origin, to: heading.position } : undefined}
              />
              {heading && navigation && (
                <NavBar
                  name={heading.name}
                  address={heading.address}
                  travel={navigation.travel}
                  heading={navigation.clock}
                  located={Boolean(here)}
                  status={location.status}
                  onClear={() => {
                    setHeading(undefined)
                    location.stop()
                  }}
                />
              )}
              {!data.embargo.artReleased && !embargoNoticeSeen && (
                <Alert
                  severity="info"
                  variant="filled"
                  onClose={() => setEmbargoNoticeSeen(true)}
                  sx={{
                    position: 'absolute',
                    top: 8,
                    left: 8,
                    right: { xs: 8, sm: 'auto' },
                    maxWidth: { sm: 360 },
                    py: 0.25,
                    opacity: 0.95,
                  }}
                >
                  <Typography variant="body2">
                    Art locations are embargoed until Gates open.
                  </Typography>
                </Alert>
              )}
            </>
          )}
        </Box>
      </Box>

      <SavePlaceDialog
        open={Boolean(saving)}
        address={saving?.address ?? ''}
        onSave={(name) => {
          if (saving) savePlace(name, saving.position, saving.address)
          setSaving(undefined)
          setProbe(`Saved "${name}"`)
        }}
        onClose={() => setSaving(undefined)}
      />

      <FilterSheet
        open={filtersOpen}
        options={FILTERS}
        active={active}
        cityUp={cityUp}
        places={places}
        onToggle={toggleFilter}
        onToggleCityUp={toggleCityUp}
        onGoToPlace={(place) => {
          setFiltersOpen(false)
          setHeading({ name: place.name, position: place.position, address: place.address })
          location.start()
        }}
        onRemovePlace={removePlace}
        onClose={() => setFiltersOpen(false)}
      />

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
          compact={compact}
        />
      )}

      <DetailDrawer
        poi={selected}
        events={selected ? (eventsByHost.get(selected.uid) ?? []) : []}
        origin={origin ?? [0, 0]}
        originLabel={originLabel}
        isFavorite={selected ? favorites.has(selected.uid) : false}
        onToggleFavorite={toggleFavorite}
        onShare={(poi) => void share({ poi: poi.uid }, poi.name)}
        onNavigate={(poi) => {
          setHeading({ name: poi.name, position: poi.position, address: poi.address })
          setSelected(undefined)
          location.start()
        }}
        onClose={() => setSelected(undefined)}
        compact={compact}
      />

      <Snackbar
        open={Boolean(probe)}
        autoHideDuration={6000}
        onClose={() => setProbe(undefined)}
        message={probe}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        action={
          pin && probe === pin.address ? (
            <>
              <Button color="secondary" size="small" onClick={() => setSaving(pin)}>
                Save
              </Button>
              <Button
                color="secondary"
                size="small"
                onClick={() => void share({ at: pin.address }, `Meet me at ${pin.address}`)}
              >
                Share
              </Button>
            </>
          ) : undefined
        }
      />
    </ThemeProvider>
  )
}
