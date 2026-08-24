import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  GeolocateControl,
  Map as MapGL,
  NavigationControl,
  Marker,
  type MapLayerMouseEvent,
  type MapRef,
} from '@vis.gl/react-maplibre'
import { Button, Stack, Typography } from '@mui/material'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined'
import type { GeoJSONSource } from 'maplibre-gl'
import type { PlayaData } from '../data/usePlayaData'
import type { Poi, PoiKind } from '../data/types'
import type { SavedPlace } from '../data/useSavedPlaces'
import { reverseGeocode } from '../brc/geocode'
import type { Position } from '../brc/geo'
import { cityOutlinePoints, frameFor } from '../brc/frame'
import { CityLayers, LANDMARK_LAYER_ID } from './CityLayers'
import { POI_CLUSTER_LAYER_ID, POI_LABEL_LAYER_ID, POI_LAYER_ID, PoiLayers } from './PoiLayers'

/** How far from the tap to look for the label that names what was tapped. */
const LABEL_HIT_RADIUS = 18
/**
 * The same allowance for the survey's dots, which carry no label to aim at.
 * Also used for saved spots: their dot is the same kind of small circular
 * target, and the priority they need over everything else (see
 * `handleClick`) is about hit-test *order*, not a bigger hit box.
 */
const DOT_HIT_RADIUS = 12
import { RouteLayer } from './RouteLayer'
import { SAVED_LAYER_ID, SavedPlacesLayer } from './SavedPlacesLayer'
import { SERVICE_LAYER_ID, ServiceLayers, TOILET_LAYER_ID } from './ServiceLayers'
import { pickByPriority } from './pick'
import { baseStyle, paletteFor, type ThemeMode } from './style'
import { FocusMarker } from './FocusMarker'
import { PlayaScene } from './PlayaScene'
import { assetUrl } from '../config'

interface Props {
  data: PlayaData
  mode: ThemeMode
  /**
   * Label sizes, scaled by the reader's size preference. Unlike the interface,
   * the map's labels have room to grow into.
   */
  labelScale: number
  visible: Set<PoiKind>
  showServices: boolean
  showToilets: boolean
  /** True to rotate the map so 12:00 points up, which is how the city reads. */
  cityUp: boolean
  /**
   * Fires with the map's actual current bearing whenever it changes, for any
   * reason — a gesture, the built-in compass control, or a programmatic
   * `easeTo`. The caller derives its own orientation display from this
   * rather than from whichever toggle last requested a rotation, since only
   * this reflects what the map is actually showing.
   */
  onBearingChange?: (bearing: number) => void
  onSelect: (poi: Poi | undefined) => void
  onProbe: (address: string, position: Position) => void
  /** Fires when the map's locate control is pressed. */
  onLocate: () => void
  /** A dropped or shared location to mark, if any. */
  pin?: { position: Position; address: string }
  /** Fires when the pin marker itself is tapped, to reopen its actions. */
  onPinClick?: () => void
  /**
   * Where a shared link wants the camera. Framing the whole city on load would
   * otherwise race this and win, dropping the visitor on the city view instead
   * of the place they were sent to.
   */
  initialTarget?: Position
  /** Straight line drawn to the place being navigated to. */
  route?: { from: Position; to: Position }
  /** The listing whose detail drawer is open. */
  selected?: Poi
  /** Kept visible after the detail drawer closes and navigation begins. */
  destination?: { name: string; position: Position; address?: string; approximate?: boolean }
  savedPlaces: SavedPlace[]
  onSelectPlace: (id: string) => void
  mapRef: React.RefObject<MapRef | null>
}

const GLYPHS = assetUrl('fonts/{fontstack}/{range}.pbf')

export type RenderStatus = 'starting' | 'ready' | 'failed'
export type RenderStatusEvent = 'load' | 'error' | 'context-lost' | 'context-restored' | 'timeout'

/**
 * Pure so the failure/recovery logic can be tested without a real MapLibre
 * instance — jsdom has no WebGL, so nothing that actually drives a `Map` can
 * run in a unit test. `error` and `timeout` are only fatal while still
 * `starting`: once the map has genuinely loaded, most 'error' events are
 * transient (a source hiccup, a style warning), and treating every one of
 * those as fatal would be worse than the blank-map bug this exists to catch.
 * Context loss is the one event that can strike a map that already loaded
 * fine, so it goes straight to `failed` regardless of current status.
 */
export function nextRenderStatus(current: RenderStatus, event: RenderStatusEvent): RenderStatus {
  switch (event) {
    case 'load':
      return 'ready'
    case 'context-restored':
      return 'ready'
    case 'context-lost':
      return 'failed'
    case 'error':
    case 'timeout':
      return current === 'starting' ? 'failed' : current
  }
}

/**
 * Ranger stations, medical, ice, toilets, the Man and the portals. They come
 * from the survey rather than the listings API, but a tap on one asks the same
 * question a tap on a camp does, and gets the same answer.
 */
const CIVIC_LAYER_IDS = [SERVICE_LAYER_ID, TOILET_LAYER_ID, LANDMARK_LAYER_ID]

/** Everything a tap can land on, so the cursor knows where it is worth one. */
const INTERACTIVE_LAYER_IDS = [
  POI_CLUSTER_LAYER_ID,
  POI_LAYER_ID,
  SAVED_LAYER_ID,
  ...CIVIC_LAYER_IDS,
]

export function MapView({
  data,
  mode,
  labelScale,
  visible,
  showServices,
  showToilets,
  cityUp,
  onBearingChange,
  onSelect,
  onProbe,
  onLocate,
  pin,
  onPinClick,
  initialTarget,
  route,
  selected,
  destination,
  savedPlaces,
  onSelectPlace,
  mapRef,
}: Props) {
  const palette = paletteFor(mode)
  const style = useMemo(() => baseStyle(palette, GLYPHS), [palette])
  const [cursor, setCursor] = useState<string>()
  const poiIndex = useMemo(
    () => new globalThis.Map(data.pois.map((poi) => [poi.uid, poi])),
    [data.pois],
  )

  /**
   * A blank/background-only map is a materially worse failure than a data
   * error: there is nothing on screen telling the user to reload, and for an
   * offline-first navigation app that may be the only recovery available. A
   * missing/corrupt worker asset, WebGL init failure, or context loss can all
   * leave the map exactly there — background painted, `load` never firing —
   * without ever reaching React's own error boundary, since none of this is a
   * render exception.
   */
  const [renderStatus, setRenderStatus] = useState<RenderStatus>('starting')
  const renderStatusRef = useRef(renderStatus)
  const applyRenderEvent = useCallback((event: RenderStatusEvent) => {
    renderStatusRef.current = nextRenderStatus(renderStatusRef.current, event)
    setRenderStatus(renderStatusRef.current)
  }, [])

  // Bounded watchdog: `onLoad` racing an indefinitely stuck worker/style init
  // otherwise leaves the loading state (or nothing at all) on screen forever.
  useEffect(() => {
    if (renderStatus !== 'starting') return
    const timeout = setTimeout(() => applyRenderEvent('timeout'), 15_000)
    return () => clearTimeout(timeout)
  }, [renderStatus, applyRenderEvent])

  // Frame the whole city rather than guessing a zoom. A fixed zoom that suits a
  // desktop window crops the city badly on a tall phone screen.
  const outline = useMemo(() => cityOutlinePoints(data.city.streets), [data.city])

  const handleClick = useCallback(
    (event: MapLayerMouseEvent) => {
      const { x, y } = event.point
      const project = (position: [number, number]) => event.target.project(position)
      const queryLayer = (layers: string[], radius: number) =>
        event.target.queryRenderedFeatures(
          [
            [x - radius, y - radius],
            [x + radius, y + radius],
          ],
          { layers },
        )

      // Deliberate, deterministic priority across every tappable layer —
      // never `event.features[0]`, whose order follows paint order (saved
      // places are drawn *before* ServiceLayers/PoiLayers) rather than what
      // the tap meant. `pickByPriority` walks these groups in order and
      // takes the first one with a candidate near the tap, regardless of
      // whether a later group's candidate happens to be a pixel closer:
      //
      // 1. Saved spots — the user's own placements. A "My camp" or meeting
      //    point dropped on top of a camp/service/landmark must still open
      //    the saved spot, not whatever the renderer stacked over it. This
      //    is the fix for issue #26: previously a saved spot only won when
      //    it happened to be `event.features[0]`, so one visually underneath
      //    something else was untappable from the map.
      // 2. Civic/safety features (rangers, medical, ice, toilets, the Man,
      //    the portals) — survey-sourced and safety-relevant, so they beat
      //    ordinary listings. Each stands alone at its own point, so nearest
      //    to the tap is unambiguous.
      // 3. POI labels — a playa address names an intersection, so several
      //    camps can genuinely share one point. Only one wins the label, and
      //    that is the name that was actually tapped.
      const picked = pickByPriority(
        [
          { id: 'saved', idKey: 'id', features: queryLayer([SAVED_LAYER_ID], DOT_HIT_RADIUS) },
          { id: 'civic', features: queryLayer(CIVIC_LAYER_IDS, DOT_HIT_RADIUS) },
          { id: 'poi-label', features: queryLayer([POI_LABEL_LAYER_ID], LABEL_HIT_RADIUS) },
        ],
        event.point,
        project,
      )
      if (picked?.groupId === 'saved' && picked.feature.properties?.id) {
        onSelectPlace(String(picked.feature.properties.id))
        return
      }
      if (picked && picked.feature.properties?.uid) {
        onSelect(poiIndex.get(String(picked.feature.properties.uid)))
        return
      }

      // Cluster bubbles are checked after saved spots (which must remain
      // reachable even if a saved marker happens to sit under one) but have
      // no equivalent of "nearest anchor" — expanding the wrong cluster
      // isn't a coherent fallback, so this stays tied to MapLibre's own
      // top-of-stack hit the way it always was.
      const hit = event.features?.[0]
      if (hit?.layer?.id === POI_CLUSTER_LAYER_ID && hit.properties?.cluster_id) {
        const source = event.target.getSource('pois') as GeoJSONSource
        const center = (hit.geometry as GeoJSON.Point).coordinates as Position
        void source.getClusterExpansionZoom(Number(hit.properties.cluster_id)).then((zoom) => {
          event.target.easeTo({ center, zoom: Math.max(zoom, event.target.getZoom() + 1), duration: 500 })
        })
        return
      }

      // 4. Whatever MapLibre's own hit under the cursor was, if none of the
      //    boxed queries above found anything nameable — e.g. a POI dot with
      //    no label visible yet at this zoom.
      const fallback = event.features?.find((feature) => feature.properties?.uid)
      if (fallback?.properties?.uid) {
        onSelect(poiIndex.get(String(fallback.properties.uid)))
        return
      }
      // Clicking bare playa answers "where am I?" in the only vocabulary that
      // works out here — a clock position and a street.
      const position: Position = [event.lngLat.lng, event.lngLat.lat]
      onProbe(reverseGeocode(position, data.layout).label, position)
      onSelect(undefined)
    },
    [data.layout, onProbe, onSelect, onSelectPlace, poiIndex],
  )

  return (
    <>
    <MapGL
      ref={mapRef}
      initialViewState={{
        longitude: data.layout.center.geometry.coordinates[0],
        latitude: data.layout.center.geometry.coordinates[1],
        zoom: 13,
        // 12:00 sits at compass bearing 45°, so rotating the map by that much
        // puts the Man at the centre with 12:00 straight up.
        bearing: cityUp ? data.layout.bearing : 0,
      }}
      mapStyle={style}
      interactiveLayerIds={INTERACTIVE_LAYER_IDS}
      onClick={handleClick}
      onError={(event) => {
        console.error('Map rendering error:', event.error)
        // Before the map has ever loaded, any error is startup-fatal — there
        // is no known-good render to fall back to. Once it has loaded, most
        // 'error' events are transient (a source hiccup, a style warning);
        // turning every one of those into a full failure screen would be
        // worse than the bug this exists to catch. WebGL context loss is the
        // one exception — handled separately below, since it can happen at
        // any point, not just during startup.
        applyRenderEvent('error')
      }}
      onMouseMove={(event) => setCursor(event.features?.length ? 'pointer' : undefined)}
      onMouseLeave={() => setCursor(undefined)}
      cursor={cursor}
      onRotate={(event) => onBearingChange?.(event.viewState.bearing)}
      onLoad={(event) => {
        const map = event.target
        const bearing = cityUp ? data.layout.bearing : 0
        // `jumpTo` below only fires MapLibre's own 'rotate' event when the
        // bearing actually changes from whatever `initialViewState` set —
        // report it directly too, so the caller's orientation state is
        // correct from the first frame even when it doesn't.
        onBearingChange?.(bearing)

        if (initialTarget) {
          map.jumpTo({ center: initialTarget, zoom: 16.5, bearing })
        } else {
          // Frame the city for the viewport actually in front of the user.
          const canvas = map.getCanvas()
          const frame = frameFor(
            outline,
            data.layout.center.geometry.coordinates as Position,
            bearing,
            { width: canvas.clientWidth, height: canvas.clientHeight, padding: 40 },
          )
          if (frame) map.jumpTo({ center: frame.center, zoom: frame.zoom, bearing })
        }
        // A readiness flag end-to-end tests can wait on in any build. The map
        // handle itself is only exposed in development.
        document.documentElement.dataset.mapReady = 'true'
        if (process.env.NEXT_PUBLIC_E2E === '1') {
          ;(window as unknown as Record<string, unknown>).__map = event.target
        }
        applyRenderEvent('load')
        // Not surfaced by @vis.gl/react-maplibre as its own prop — attached
        // directly to the underlying maplibre-gl Map. A lost GL context can
        // strike a map that already loaded fine minutes ago (a backgrounded
        // tab, a GPU driver reset), and MapLibre does not recover from it on
        // its own the way it silently replays sources/layers after most
        // other disruptions.
        map.on('webglcontextlost', () => applyRenderEvent('context-lost'))
        map.on('webglcontextrestored', () => applyRenderEvent('context-restored'))
      }}
      maxPitch={60}
      /*
       * No attribution control. There is no basemap to attribute — the city is
       * drawn from the survey, and the survey is credited in the footnote, next
       * to the non-affiliation line it belongs beside. A second floating pill
       * saying nearly the same thing sat in the middle of the map on a phone.
       */
      attributionControl={false}
      style={{ position: 'absolute', inset: 0 }}
    >
      <NavigationControl position="bottom-right" visualizePitch showCompass />
      {/*
       * `trackUserLocation` is deliberately off. With it on, this control ran
       * its own continuous `watchPosition` independent of `useGeolocation`'s —
       * two high-accuracy trackers that could both be active at once, with no
       * single place to stop them from. As a one-shot locate button it fires
       * once per press and hands ownership of ongoing tracking to the app's
       * one watch instead.
       */}
      <GeolocateControl
        position="bottom-right"
        positionOptions={{ enableHighAccuracy: true }}
        onGeolocate={() => onLocate()}
      />
      {pin && (
        <Marker longitude={pin.position[0]} latitude={pin.position[1]} anchor="bottom">
          {/*
           * Otherwise inert once the six-second Save/Share snackbar that
           * created it auto-hides: the pin stayed on the map with no way
           * back to those actions short of dropping a fresh one on top of it.
           */}
          <button
            type="button"
            title={pin.address}
            aria-label={`Marked location: ${pin.address}. Reopen save and share options.`}
            onClick={onPinClick}
            style={{
              width: 16,
              height: 16,
              padding: 0,
              border: `2px solid ${palette.playa}`,
              borderRadius: '50% 50% 50% 0',
              transform: 'rotate(-45deg)',
              background: palette.art,
              boxShadow: '0 1px 4px rgba(0,0,0,0.6)',
              cursor: 'pointer',
            }}
          />
        </Marker>
      )}

      {selected && !destination && (
        <FocusMarker
          position={selected.position}
          name={selected.name}
          address={selected.address}
          palette={palette}
        />
      )}
      {destination && (
        <FocusMarker
          position={destination.position}
          name={destination.name}
          address={destination.address}
          navigating
          approximate={destination.approximate}
          palette={palette}
        />
      )}

      {/* The drawn desert, under everything the survey put on it. */}
      <PlayaScene layout={data.layout} palette={palette} />
      <CityLayers
        city={data.city}
        campOutlines={data.campOutlines}
        palette={palette}
        labelScale={labelScale}
      />
      <RouteLayer from={route?.from} to={route?.to} palette={palette} />
      <SavedPlacesLayer places={savedPlaces} palette={palette} labelScale={labelScale} />
      <ServiceLayers
        services={data.services}
        toilets={data.toilets}
        showServices={showServices}
        showToilets={showToilets}
        palette={palette}
        labelScale={labelScale}
      />
      <PoiLayers
        pois={data.pois}
        visible={visible}
        palette={palette}
        labelScale={labelScale}
        focusPosition={destination?.position ?? selected?.position}
      />
    </MapGL>
    {renderStatus === 'failed' && (
      // A blank/background-only map has no other way to tell the user
      // anything is wrong, let alone how to fix it — this is deliberately
      // the loudest thing on screen while it's showing, covering the map
      // and its controls rather than sharing space with them.
      <Stack
        sx={{
          position: 'absolute',
          inset: 0,
          zIndex: 5,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          px: 4,
          textAlign: 'center',
          bgcolor: 'background.default',
        }}
      >
        <ErrorOutlineIcon sx={{ fontSize: 40, color: 'error.main' }} />
        <Typography variant="h6">The map stopped rendering</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 340 }}>
          Something kept the map from drawing — often fixed by reloading. Saved spots and
          favourites are stored on this device and are not affected.
        </Typography>
        <Button variant="contained" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </Stack>
    )}
    </>
  )
}
