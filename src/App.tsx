import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import './map/worker'
import { DATA_YEAR } from './config'
import {
  Alert,
  AppBar,
  Box,
  Button,
  CircularProgress,
  CssBaseline,
  IconButton,
  Paper,
  Snackbar,
  Stack,
  ThemeProvider,
  Toolbar,
  TextField,
  Typography,
} from '@mui/material'
import { useMediaQuery } from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import InputAdornment from '@mui/material/InputAdornment'
import CloseIcon from '@mui/icons-material/Close'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import TuneIcon from '@mui/icons-material/Tune'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import NightlightIcon from '@mui/icons-material/Nightlight'
import LightModeIcon from '@mui/icons-material/LightMode'
import ExploreIcon from '@mui/icons-material/Explore'
import EventIcon from '@mui/icons-material/Event'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import GroupsIcon from '@mui/icons-material/Groups'
import WcIcon from '@mui/icons-material/Wc'
import LocalHospitalIcon from '@mui/icons-material/LocalHospital'
import StarIcon from '@mui/icons-material/Star'
import type { MapRef } from '@vis.gl/react-maplibre'
import { MapView } from './map/MapView'
import { SearchPanel } from './ui/SearchPanel'
import { DetailDrawer } from './ui/DetailDrawer'
import { UnplacedSheet } from './ui/UnplacedSheet'
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
import { addressFor, deepLinkUrl, resolveDeepLink, shareUrl, useDeepLink } from './data/useDeepLink'
import { travelBetween } from './brc/travel'
import { bearingToClock, bearingBetween } from './brc/geo'
import { shareLink } from './ui/share'
import type { Poi, PoiKind, UnplacedListing } from './data/types'
import { reverseGeocode } from './brc/geocode'
import type { Position } from './brc/geo'
import { paletteFor, type PlayaPalette, type ThemeMode } from './map/style'
import { BRAND } from './brand'
import { BrandMark } from './ui/BrandMark'
import { PwaStatus } from './ui/PwaStatus'
import { ControlButton, ControlDivider, ControlGroup } from './ui/ControlGroup'
import { BottomBar } from './ui/BottomBar'
import { FirstRun } from './ui/FirstRun'
import { haptic } from './ui/haptics'

type Filter = PoiKind | 'toilets' | 'services' | 'favorites'

/** Surveyed rather than listed: the city's own places, not participants'. */
const isCivic = (poi: Poi) => poi.kind === 'service' || poi.kind === 'landmark'

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

/**
 * Each filter names the colour its own markers are drawn in rather than a MUI
 * palette slot, so the row reads as the map's legend instead of five controls
 * that happen to be different colours. It follows the map into night mode for
 * free, because that is where the colours come from.
 */
const FILTERS: {
  key: Filter
  label: string
  accent: keyof PlayaPalette
  icon: ReactElement
}[] = [
  { key: 'art', label: 'Art', accent: 'art', icon: <AutoAwesomeIcon /> },
  { key: 'camp', label: 'Camps', accent: 'camp', icon: <GroupsIcon /> },
  { key: 'toilets', label: 'Toilets', accent: 'toilet', icon: <WcIcon /> },
  { key: 'services', label: 'Services', accent: 'medical', icon: <LocalHospitalIcon /> },
  { key: 'favorites', label: 'Saved', accent: 'saved', icon: <StarIcon /> },
]

export default function App() {
  const { data, error, retry } = usePlayaData()
  const { favorites, toggle: toggleFavorite } = useFavorites()
  const { places, save: savePlace, remove: removePlace, restore: restorePlace } = useSavedPlaces()
  const [saving, setSaving] = useState<{ position: Position; address: string }>()
  const [mode, setMode] = useState<ThemeMode>('dark')
  const [cityUp, setCityUp] = useState(true)
  const [active, setActive] = useState<Set<Filter>>(
    () => new Set<Filter>(['art', 'camp', 'toilets', 'services']),
  )
  const [selected, setSelected] = useState<Poi>()
  // A listing with no location to open on — before Gates, all of the art.
  const [unplaced, setUnplaced] = useState<UnplacedListing>()
  const [probe, setProbe] = useState<string>()
  const [deletedPlace, setDeletedPlace] = useState<(typeof places)[number]>()
  // The map's own locate button and the "take me there" flow feed the same
  // watch, so a heading stays live however it was started.
  const location = useGeolocation()
  const [manualHere, setManualHere] = useState<Position>()
  const here = location.position ?? manualHere
  const [eventsOpen, setEventsOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  /**
   * Dismissing the embargo notice has to stick. It is true for weeks before the
   * event, and re-announcing it on every launch turns a useful explanation into
   * something the user has to swat away each time they open the map. Keyed by
   * year so next year's embargo introduces itself again.
   */
  const EMBARGO_NOTICE_KEY = `dust-compass:embargo-notice:${DATA_YEAR}`
  const [embargoNoticeSeen, setEmbargoNoticeSeen] = useState(() => {
    try {
      return localStorage.getItem(EMBARGO_NOTICE_KEY) === 'seen'
    } catch {
      // Private windows and blocked site data both throw. The notice showing
      // twice is a far smaller problem than the map not opening.
      return false
    }
  })
  const dismissEmbargoNotice = useCallback(() => {
    setEmbargoNoticeSeen(true)
    try {
      localStorage.setItem(EMBARGO_NOTICE_KEY, 'seen')
    } catch {
      /* nothing to do — see above */
    }
  }, [EMBARGO_NOTICE_KEY])
  const [realNow, setRealNow] = useState(() => new Date())
  const clock = useMemo(() => scheduleClock(data?.range, realNow), [data?.range, realNow])
  const mapRef = useRef<MapRef>(null)
  const theme = useMemo(() => playaTheme(mode), [mode])
  const palette = useMemo(() => paletteFor(mode), [mode])
  // Phones are the real target here; the desktop layout is the special case.
  const compact = useMediaQuery(theme.breakpoints.down('md'))
  /*
   * The filter keys are in the bar from `md` up; this is only about whether
   * they can afford their names. Written out as measurements, because that is
   * what decided it — search width across the breakpoints, with the labels on
   * at `lg`: 385, 420, 363, 480. The dip at 1280 is the five names arriving and
   * taking 240px out of the one control that always needs width. At `xl` they
   * arrive somewhere there is genuinely room: 385, 420, 480, 480, 560.
   *
   * Below that the keys keep their icons, their tooltips, and the accent colour
   * that ties each to what it draws on the map.
   */
  const roomForFilterChips = useMediaQuery(theme.breakpoints.up('xl'))
  const eventsByHost = useEventsByHost(data)
  const { initial: deepLink, publish } = useDeepLink()
  const [pin, setPin] = useState<{ position: Position; address: string }>()
  const [heading, setHeading] = useState<{
    name: string
    position: Position
    address?: string
    approximate?: boolean
  }>()

  // "On now" has to stay true as time passes, or the panel quietly lies.
  useEffect(() => {
    const id = setInterval(() => setRealNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])


  /**
   * The desktop detail panel is a column of the layout, so opening it takes
   * width away from the map. MapLibre sizes its canvas once and does not watch
   * for that, so it has to be told — otherwise the city stays drawn at the old
   * width and everything on it is fractionally in the wrong place.
   */
  useEffect(() => {
    if (compact) return
    const id = requestAnimationFrame(() => mapRef.current?.resize())
    return () => cancelAnimationFrame(id)
  }, [compact, selected])

  /**
   * Keyboard shortcuts, for the half of the audience planning their week at a
   * desk rather than finding a bathroom at 3am. Deliberately not while typing:
   * "f" is a letter before it is a shortcut.
   */
  const searchInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true

      if (event.key === 'Escape') {
        // Whatever is open, innermost first, so one key walks back out.
        if (saving) return
        if (eventsOpen) setEventsOpen(false)
        else if (filtersOpen) setFiltersOpen(false)
        else if (selected) setSelected(undefined)
        else if (heading) {
          setHeading(undefined)
          location.stop()
        } else if (typing) searchInput.current?.blur()
        return
      }
      if (typing) return
      if (event.key === '/') {
        event.preventDefault()
        searchInput.current?.focus()
      } else if (event.key === 'e' || event.key === 'E') {
        setEventsOpen((open) => !open)
      } else if (event.key === 'f' || event.key === 'F') {
        setFiltersOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [eventsOpen, filtersOpen, heading, location, saving, selected])

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

  const [restoredLink, setRestoredLink] = useState<string | null>(null)
  const linkKey = deepLink.poi ?? deepLink.at ?? null
  // Apply restoration during render so the selection/pin and its guard commit
  // together. This also prevents the URL-mirroring effect from erasing a cold
  // deep link while the dataset is arriving.
  if (data && initialTarget && linkKey && restoredLink !== linkKey) {
    const target = data.pois.find((poi) => poi.uid === deepLink.poi)
    if (target) {
      setSelected(target)
    } else {
      setPin({
        position: initialTarget,
        address: deepLink.at ?? addressFor(initialTarget, data.layout),
      })
    }
    setRestoredLink(linkKey)
  }
  // A shared link to something with no location still has to land on it. There
  // is no camera move to make, so this sits outside the block above, which
  // exists to aim one.
  if (data && !initialTarget && deepLink.poi && restoredLink !== linkKey) {
    setUnplaced(data.unplaced.find((listing) => listing.uid === deepLink.poi))
    setRestoredLink(linkKey)
  }

  // Keep the address bar in step with what is on screen, so the link in the
  // browser is always the one worth sharing.
  useEffect(() => {
    if (!data) return
    // Do not erase a cold deep link during the render in which its data first
    // arrives. Restoration commits first; only then does normal URL mirroring
    // take over.
    if (linkKey && restoredLink !== linkKey) return
    if (selected) publish({ poi: selected.uid })
    else if (unplaced) publish({ poi: unplaced.uid })
    else if (pin) publish({ at: pin.address })
    else publish({})
  }, [data, selected, unplaced, pin, publish, linkKey, restoredLink])

  const visiblePois = useMemo(() => {
    if (!data) return []
    if (!active.has('favorites')) return data.pois
    // "Saved" narrows the listings, not the city. Rangers and toilets have
    // their own switches, and a filter meant to cut the clutter should not
    // quietly take the map's infrastructure — or a tap on it — away with it.
    return data.pois.filter((poi) => favorites.has(poi.uid) || isCivic(poi))
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
  /**
   * Arrival, buzzed once. The whole point of giving the heading as a clock
   * position is that you can act on it without looking at the screen, so the
   * app has to be able to say "you are here" without being looked at either.
   *
   * Latched, so a GPS fix jittering across the threshold does not buzz over and
   * over. No snackbar to go with it: the navigation strip is already showing the
   * distance counting down, and it is the buzz that carries the news to someone
   * whose phone is in a pocket.
   */
  const arrived = useRef(false)
  useEffect(() => {
    if (!navigation || arrived.current) return
    if (navigation.travel.meters > 25) return
    arrived.current = true
    haptic('arrive')
  }, [navigation])


  /**
   * How much of the map the detail sheet is about to cover. It was a flat 70%
   * of the screen, and the sheet is nothing of the sort — it is as tall as its
   * contents, which measured nearer a third. The map dutifully lifted the place
   * you had just chosen into the top eighth of the screen and left a third of
   * a screen of empty desert between it and the sheet.
   *
   * The sheet reports its own height as it opens; until the first one has, an
   * estimate stands in. On desktop the panel is a column beside the map rather
   * than a layer over it, so there is nothing to compensate for at all.
   */
  const detailHeight = useRef(0)
  const focusPadding = useCallback(() => {
    if (compact) {
      const covered = detailHeight.current || Math.round(window.innerHeight * 0.38)
      return { top: 24, right: 24, bottom: covered + 24, left: 24 }
    }
    return { top: 32, right: 32, bottom: 32, left: 32 }
  }, [compact])

  const navigationPadding = useCallback(
    () =>
      compact
        ? { top: 72, right: 20, bottom: 136, left: 20 }
        : { top: 88, right: 32, bottom: 112, left: 32 },
    [compact],
  )

  const navigateTo = useCallback(
    (target: { name: string; position: Position; address?: string; positionSource?: 'gps' | 'address' }) => {
      setHeading({ ...target, approximate: target.positionSource === 'address' })
      arrived.current = false
      setSelected(undefined)
      mapRef.current?.flyTo({
        center: target.position,
        zoom: 16.5,
        duration: 900,
        padding: navigationPadding(),
      })
      location.start()
    },
    [location, navigationPadding],
  )

  const flyTo = useCallback(
    (position: Position, poi?: Poi) => {
      mapRef.current?.flyTo({
        center: position,
        zoom: 16.5,
        duration: 900,
        padding: poi ? focusPadding() : { top: 0, right: 0, bottom: 0, left: 0 },
      })
      setSelected(poi)
      setUnplaced(undefined)
      if (!poi && data) setPin({ position, address: addressFor(position, data.layout) })
    },
    [data, focusPadding],
  )

  const share = useCallback(
    async (link: { poi?: string; at?: string }, title: string, unfurls = true) => {
      // Only listings have a page of their own to unfurl. The survey's places
      // are not in the API's export, so a link to one has to be the app's own
      // URL — a `/p/` link would 404 rather than open anything.
      const result = await shareLink(unfurls ? shareUrl(link) : deepLinkUrl(link), title)
      if (result === 'copied') setProbe('Link copied')
      else if (result === 'unavailable') setProbe('Could not copy the link')
    },
    [],
  )

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
        {/* MUI's "default" AppBar is grey-900, which put a cold neutral slab
            above an app whose every other surface is warm. It takes the same
            paper as everything else and is separated by a hairline. */}
        <AppBar
          position="static"
          color="transparent"
          elevation={0}
          sx={{
            bgcolor: 'background.paper',
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Toolbar sx={{ gap: 1, minHeight: { xs: 56, md: 64 }, py: 1 }}>
            {/* On a phone this is decoration standing between the user and the
                one control that matters; the icon and splash already brand it. */}
            {compact && (
              <BrandMark size={32} sx={{ flexShrink: 0, display: { xs: 'none', sm: 'block' } }} />
            )}
            {!compact && (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mr: 1 }}>
                <BrandMark size={34} sx={{ flexShrink: 0 }} />
                {/* The name and tagline are worth 180px of a 1440px bar and are
                    not worth it on a 900px one, where they were taking the room
                    out of the search box. The mark alone still brands the bar. */}
                <Box sx={{ display: { xs: 'none', lg: 'block' } }}>
                  <Typography variant="h6" sx={{ whiteSpace: 'nowrap', lineHeight: 1.05 }}>
                    {BRAND.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                    {BRAND.tagline}
                  </Typography>
                </Box>
              </Stack>
            )}

            {/* On a phone this is now the only thing sharing the bar with the
                brand mark and the status readout — the actions moved to the
                bottom — so it gets the width instead of being squeezed to 79px
                by four buttons that would not shrink. */}
            <Box
              sx={{
                flex: '1 1 auto',
                minWidth: { xs: 0, sm: 220 },
                maxWidth: { md: 420, lg: 480, xl: 560 },
              }}
            >
              {data ? (
                <SearchPanel
                  layout={data.layout}
                  pois={data.pois}
                  unplaced={data.unplaced}
                  places={places}
                  onGo={flyTo}
                  onOpenUnplaced={(listing) => {
                    setSelected(undefined)
                    setUnplaced(listing)
                  }}
                  inputRef={searchInput}
                  compact={compact}
                />
              ) : (
                // Hold the shape. An empty box here left the buttons stranded
                // against the right edge of an otherwise blank bar.
                <TextField
                  fullWidth
                  // Matches the real search field exactly, including the touch
                  // floor it picks up from the theme. `medium` here made the
                  // placeholder 56px against the live field's 44px, so the whole
                  // toolbar jumped height the moment the data arrived.
                  size="small"
                  disabled
                  placeholder="Loading the playa…"
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon fontSize="small" />
                        </InputAdornment>
                      ),
                    },
                  }}
                />
              )}
            </Box>

            {/* Two groups rather than nine loose buttons: what is drawn on the
                map, and how the map is drawn. The status readout stays outside
                both, because it is something to read, not something to press.

                On a phone none of it is here at all — it is in the bottom bar,
                inside the arc a thumb can actually reach, and the search box
                gets the width the four of them were taking. */}
            <Stack
              direction="row"
              spacing={1.25}
              sx={{ alignItems: 'center', ml: 'auto', flexShrink: 0 }}
            >
              <PwaStatus compact={compact} />
              {!compact && (
                <>
                  <ControlGroup>
                    {/* The filters appear from `md` up, and only put their names
                        on from `lg`. They used to be all-or-nothing at `lg`,
                        which made search *narrower* on a 1280 desktop than on a
                        1024 laptop — five labelled keys arrived in one step and
                        took the width out of the one control that always needs
                        it. Dropping to icons in between lets the bar hand back
                        a little at a time. */}
                    {FILTERS.map((filter) => (
                      <ControlButton
                        key={filter.key}
                        icon={filter.icon}
                        label={roomForFilterChips ? filter.label : undefined}
                        title={filter.label}
                        selected={active.has(filter.key)}
                        pressed={active.has(filter.key)}
                        accent={palette[filter.accent]}
                        onClick={() => toggleFilter(filter.key)}
                      />
                    ))}
                    <ControlDivider />
                    <ControlButton
                      icon={<TuneIcon />}
                      title="Filters and saved spots"
                      onClick={() => setFiltersOpen(true)}
                    />
                  </ControlGroup>
                  <ControlGroup>
                    <ControlButton
                      icon={<EventIcon />}
                      title="Show events"
                      tooltip="Events"
                      selected={eventsOpen}
                      pressed={eventsOpen}
                      onClick={() => setEventsOpen((open) => !open)}
                    />
                    <ControlButton
                      icon={<ExploreIcon />}
                      title="Orient the map so 12:00 points up"
                      tooltip={cityUp ? '12:00 is up' : 'North is up'}
                      selected={cityUp}
                      pressed={cityUp}
                      onClick={toggleCityUp}
                    />
                    <ControlButton
                      icon={
                        mode === 'dark' ? (
                          <DarkModeIcon />
                        ) : mode === 'light' ? (
                          <LightModeIcon />
                        ) : (
                          <NightlightIcon />
                        )
                      }
                      title={THEME_LABEL[mode]}
                      selected={mode === 'night'}
                      onClick={() => setMode(NEXT_MODE[mode])}
                    />
                  </ControlGroup>
                </>
              )}
            </Stack>
          </Toolbar>
        </AppBar>

        {/* The map and, on a wide screen, the detail column beside it. The
            drawer used to be a layer over the whole window, which meant it
            sliced the toolbar in half — at 1440 it cut a filter key down the
            middle. A panel that is part of the layout takes its space from the
            map instead of from the app's own chrome. */}
        <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <Box
          sx={{
            position: 'relative',
            flex: 1,
            minWidth: 0,
            '& .maplibregl-ctrl-bottom-right': {
              transition: 'bottom 180ms ease',
              bottom: heading ? { xs: 118, sm: 100 } : 0,
            },
            '& .maplibregl-ctrl-bottom-left': {
              transition: 'bottom 180ms ease',
              bottom: heading ? { xs: 118, sm: 100 } : 0,
            },
          }}
        >
          {error && (
            <Alert
              severity="error"
              action={<Button color="inherit" size="small" onClick={retry}>Retry</Button>}
              sx={{ m: 2 }}
            >
              The map data could not be opened. Check your connection once, then retry; saved spots are safe.
            </Alert>
          )}
          {!data && !error && (
            <Stack
              sx={{
                height: '100%',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                px: 4,
                textAlign: 'center',
              }}
            >
              <CircularProgress />
              <Typography variant="h6">Drawing Black Rock City</Typography>
              {/* A spinner on a black screen is indistinguishable from a broken
                  app, and this is the one moment the map has nothing to show. */}
              <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 340 }}>
                The city is built on your device from this year&rsquo;s survey, so there are no map
                tiles to wait for.
              </Typography>
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
                onSelect={(poi) => {
                  if (poi) flyTo(poi.position, poi)
                  else setSelected(undefined)
                }}
                onProbe={(address, position) => {
                  setProbe(address)
                  setPin({ position, address })
                }}
                onLocate={setManualHere}
                savedPlaces={places}
                onSelectPlace={(id) => {
                  const place = places.find((p) => p.id === id)
                  if (place) navigateTo(place)
                }}
                pin={pin}
                initialTarget={initialTarget}
                route={heading && origin ? { from: origin, to: heading.position } : undefined}
                selected={selected}
                destination={heading}
              />
              <Box
                data-testid="api-disclaimer"
                sx={{
                  position: 'absolute',
                  /*
                   * On a phone this goes to the top. The bottom of a phone is
                   * where the bar, the navigation readout and the system
                   * gesture area all live, and a footnote competing for that
                   * space was pushing the thing people actually read — where
                   * they are heading and how far — off the screen. There is
                   * nothing at the top of the map but map.
                   */
                  left: 'calc(8px + var(--safe-left))',
                  top: { xs: 'calc(8px + var(--safe-top))', sm: 'auto' },
                  bottom: {
                    xs: 'auto',
                    sm: `calc(${heading ? 112 : 34}px + var(--safe-bottom))`,
                  },
                  zIndex: 2,
                  maxWidth: {
                    xs: 'calc(100% - 88px - var(--safe-left) - var(--safe-right))',
                    sm: 430,
                  },
                  px: 1,
                  py: 0.5,
                  /*
                   * These three were hard-coded, so the one surface the app
                   * never themed was the one always on screen: a dark slab
                   * sitting on the cream map in light mode, and in red night
                   * the brightest thing in view — a 14.5:1 cream-on-black
                   * block in an interface built around not being a flashlight.
                   *
                   * It is a footnote and should read as one, so it takes the
                   * same paper as every other surface at less than full
                   * opacity, and the quieter of the two text colours.
                   */
                  bgcolor: 'background.paper',
                  color: 'text.secondary',
                  opacity: 0.92,
                  /*
                   * A footnote with nothing to press, sitting on top of the
                   * map. It was swallowing every tap that landed on it, so any
                   * camp or cluster behind it simply could not be selected —
                   * and it sits in the bottom-left corner, over the city.
                   * Clicks belong to the map underneath.
                   */
                  pointerEvents: 'none',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  backdropFilter: 'blur(4px)',
                }}
              >
                <Typography variant="caption" sx={{ display: 'block', lineHeight: 1.25 }}>
                  {BRAND.disclaimer}
                </Typography>
              </Box>
              {heading && navigation && (
                <NavBar
                  name={heading.name}
                  address={heading.address}
                  travel={navigation.travel}
                  heading={navigation.clock}
                  located={Boolean(here)}
                  status={location.status}
                  accuracy={location.accuracy}
                  approximate={heading.approximate}
                  onRetryLocation={location.start}
                  onClear={() => {
                    setHeading(undefined)
                    location.stop()
                  }}
                />
              )}
              {!data.embargo.artReleased && !embargoNoticeSeen && (
                /*
                 * This was MUI's filled `info` alert — a saturated #0288d1
                 * billboard in an app made of ember, teal and dust, and on a
                 * small phone the loudest thing on screen the moment it opened.
                 * It is a footnote about a licence condition, not an alarm, so
                 * it now wears the same paper as everything else and says its
                 * piece on one line.
                 */
                <Paper
                  elevation={0}
                  sx={{
                    position: 'absolute',
                    // Below the non-affiliation footnote on a phone, which now
                    // occupies the top-left corner.
                    top: { xs: 'calc(56px + var(--safe-top))', sm: 8 },
                    left: 8,
                    right: { xs: 8, sm: 'auto' },
                    maxWidth: { sm: 400 },
                    zIndex: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    pl: 1.25,
                    pr: 0.5,
                    py: 0.25,
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <InfoOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0 }} />
                  <Typography variant="body2" sx={{ flex: 1, color: 'text.secondary' }}>
                    Art locations are embargoed until Gates open.
                  </Typography>
                  <IconButton size="small" onClick={dismissEmbargoNotice} aria-label="Dismiss">
                    <CloseIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Paper>
              )}
            </>
          )}
        </Box>

          {/* Compact renders this as a sheet from the bottom, which portals out
              of here to the body; only the desktop panel actually occupies the
              column. Rendered once either way, so there is one of it. */}
          <DetailDrawer
            poi={selected}
            events={selected ? (eventsByHost.get(selected.uid) ?? []) : []}
            origin={origin ?? [0, 0]}
            originLabel={originLabel}
            isFavorite={selected ? favorites.has(selected.uid) : false}
            onToggleFavorite={toggleFavorite}
            onShare={(poi) => void share({ poi: poi.uid }, poi.name, !isCivic(poi))}
            onNavigate={navigateTo}
            onClose={() => setSelected(undefined)}
            onMeasure={(height) => {
              detailHeight.current = height
            }}
            compact={compact}
          />
          <UnplacedSheet
            listing={unplaced}
            onShare={(listing) => void share({ poi: listing.uid }, listing.name)}
            onClose={() => setUnplaced(undefined)}
            compact={compact}
          />
        </Box>

        {compact && (
          <BottomBar
            items={[
              {
                key: 'filters',
                label: 'Layers',
                title: 'Filters and saved spots',
                icon: <TuneIcon />,
                selected: filtersOpen,
                pressed: filtersOpen,
                onClick: () => setFiltersOpen((open) => !open),
              },
              {
                key: 'events',
                label: 'Events',
                title: 'Show events',
                icon: <EventIcon />,
                selected: eventsOpen,
                pressed: eventsOpen,
                onClick: () => setEventsOpen((open) => !open),
              },
              {
                key: 'orient',
                label: cityUp ? '12:00 up' : 'North up',
                title: 'Orient the map so 12:00 points up',
                icon: <ExploreIcon />,
                selected: cityUp,
                pressed: cityUp,
                onClick: toggleCityUp,
              },
              {
                key: 'theme',
                label: mode === 'dark' ? 'Dark' : mode === 'light' ? 'Light' : 'Night',
                title: THEME_LABEL[mode],
                icon:
                  mode === 'dark' ? (
                    <DarkModeIcon />
                  ) : mode === 'light' ? (
                    <LightModeIcon />
                  ) : (
                    <NightlightIcon />
                  ),
                selected: mode === 'night',
                onClick: () => setMode(NEXT_MODE[mode]),
              },
            ]}
          />
        )}
      </Box>

      <SavePlaceDialog
        open={Boolean(saving)}
        address={saving?.address ?? ''}
        onSave={(name) => {
          if (saving) savePlace(name, saving.position, saving.address)
          setSaving(undefined)
          setProbe(`Saved "${name}"`)
          // Usually done while already moving away from the thing being marked.
          haptic('confirm')
        }}
        onClose={() => setSaving(undefined)}
      />

      <FilterSheet
        open={filtersOpen}
        options={FILTERS}
        palette={palette}
        active={active}
        cityUp={cityUp}
        places={places}
        onToggle={toggleFilter}
        onToggleCityUp={toggleCityUp}
        onGoToPlace={(place) => {
          setFiltersOpen(false)
          navigateTo(place)
        }}
        onRemovePlace={(id) => {
          const place = places.find((item) => item.id === id)
          if (!place) return
          removePlace(id)
          setDeletedPlace(place)
          setProbe(`Removed “${place.name}”`)
        }}
        onClose={() => setFiltersOpen(false)}
      />

      {data && (
        <EventsPanel
          open={eventsOpen}
          events={data.events}
          hosts={hostsByUid}
          now={clock.now}
          preview={clock.preview}
          origin={here}
          onNeedLocation={location.start}
          onSelect={(poi) => {
            setEventsOpen(false)
            flyTo(poi.position, poi)
          }}
          onClose={() => setEventsOpen(false)}
          compact={compact}
        />
      )}

      <Snackbar
        open={Boolean(probe)}
        autoHideDuration={6000}
        onClose={() => setProbe(undefined)}
        message={probe}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        action={
          deletedPlace && probe === `Removed “${deletedPlace.name}”` ? (
            <Button
              color="secondary"
              size="small"
              onClick={() => {
                restorePlace(deletedPlace)
                setProbe(`Restored “${deletedPlace.name}”`)
                setDeletedPlace(undefined)
              }}
            >
              Undo
            </Button>
          ) : pin && probe === pin.address ? (
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

      <FirstRun />
    </ThemeProvider>
  )
}
