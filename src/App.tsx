import { useCallback, useMemo, useRef, useState } from 'react'
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
import type { MapRef } from '@vis.gl/react-maplibre'
import { MapView } from './map/MapView'
import { SearchPanel } from './ui/SearchPanel'
import { DetailDrawer } from './ui/DetailDrawer'
import { playaTheme } from './ui/theme'
import { useEventsByHost, usePlayaData } from './data/usePlayaData'
import type { Poi, PoiKind } from './data/types'
import type { Position } from './brc/geo'

export default function App() {
  const { data, error } = usePlayaData()
  const [mode, setMode] = useState<'dark' | 'light'>('dark')
  const [cityUp, setCityUp] = useState(true)
  const [visible, setVisible] = useState<Set<PoiKind>>(new Set<PoiKind>(['art', 'camp']))
  const [selected, setSelected] = useState<Poi>()
  const [probe, setProbe] = useState<string>()
  const mapRef = useRef<MapRef>(null)
  const theme = useMemo(() => playaTheme(mode), [mode])
  const eventsByHost = useEventsByHost(data)

  const flyTo = useCallback((position: Position, poi?: Poi) => {
    mapRef.current?.flyTo({ center: position, zoom: 16.5, duration: 900 })
    setSelected(poi)
  }, [])

  const toggleKind = useCallback((kind: PoiKind) => {
    setVisible((current) => {
      const next = new Set(current)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
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

  return (
    <ThemeProvider theme={theme} defaultMode={mode}>
      <CssBaseline />
      <Box sx={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column' }}>
        <AppBar position="static" color="default" elevation={0} enableColorOnDark>
          <Toolbar sx={{ gap: 2, flexWrap: 'wrap', minHeight: 64 }}>
            <Typography variant="h6" sx={{ whiteSpace: 'nowrap' }}>
              Playa Map
            </Typography>

            <Box sx={{ flex: '1 1 260px', maxWidth: 520 }}>
              {data && <SearchPanel layout={data.layout} pois={data.pois} onGo={flyTo} />}
            </Box>

            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', ml: 'auto' }}>
              {(['art', 'camp'] as PoiKind[]).map((kind) => (
                <Chip
                  key={kind}
                  label={kind === 'art' ? 'Art' : 'Camps'}
                  size="small"
                  color={kind === 'art' ? 'primary' : 'secondary'}
                  variant={visible.has(kind) ? 'filled' : 'outlined'}
                  onClick={() => toggleKind(kind)}
                />
              ))}
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
                data={data}
                mode={mode}
                visible={visible}
                cityUp={cityUp}
                mapRef={mapRef}
                onSelect={setSelected}
                onProbe={(address) => setProbe(address)}
              />
              {!data.embargo.artReleased && (
                <Alert
                  severity="info"
                  sx={{ position: 'absolute', top: 12, left: 12, maxWidth: 380 }}
                >
                  Art locations are embargoed until Gates open. Listings are shown without
                  positions.
                </Alert>
              )}
            </>
          )}
        </Box>
      </Box>

      <DetailDrawer
        poi={selected}
        events={selected ? (eventsByHost.get(selected.uid) ?? []) : []}
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
