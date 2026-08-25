import fs from 'node:fs'

function edit(path, needle, replacement) {
  const before = fs.readFileSync(path, 'utf8')
  if (!before.includes(needle)) throw new Error(`${path}: missing replacement needle: ${needle.slice(0, 120)}`)
  const after = before.replace(needle, replacement)
  fs.writeFileSync(path, after)
}

// MapView: accept complete route geometry and expose A/B preview markers.
edit(
  'src/map/MapView.tsx',
  "import type { Position } from '../brc/geo'\n",
  "import type { Position } from '../brc/geo'\nimport type { PlayaRoute } from '../brc/routing'\n",
)
edit(
  'src/map/MapView.tsx',
  "  /** Straight line drawn to the place being navigated to. */\n  route?: { from: Position; to: Position }\n",
  "  /** Surveyed/hybrid/direct route drawn for preview or active navigation. */\n  route?: PlayaRoute\n  routeStart?: Position\n  routeEnd?: Position\n",
)
edit(
  'src/map/MapView.tsx',
  "  route,\n  selected,\n",
  "  route,\n  routeStart,\n  routeEnd,\n  selected,\n",
)
edit(
  'src/map/MapView.tsx',
  "      <RouteLayer from={route?.from} to={route?.to} palette={palette} />\n",
  `      <RouteLayer route={route} palette={palette} />\n      {route && !destination && routeStart && (\n        <Marker longitude={routeStart[0]} latitude={routeStart[1]} anchor=\"center\">\n          <Box\n            data-testid=\"directions-start-marker\"\n            sx={{\n              width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center',\n              bgcolor: palette.civic, color: palette.playa, border: \`2px solid \${palette.playa}\`,\n              fontWeight: 800, boxShadow: '0 2px 8px rgba(0,0,0,.45)',\n            }}\n          >A</Box>\n        </Marker>\n      )}\n      {route && !destination && routeEnd && (\n        <Marker longitude={routeEnd[0]} latitude={routeEnd[1]} anchor=\"center\">\n          <Box\n            data-testid=\"directions-end-marker\"\n            sx={{\n              width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center',\n              bgcolor: palette.art, color: palette.playa, border: \`2px solid \${palette.playa}\`,\n              fontWeight: 800, boxShadow: '0 2px 8px rgba(0,0,0,.45)',\n            }}\n          >B</Box>\n        </Marker>\n      )}\n`,
)

// NavBar: selected travel mode, route semantics, from context, edit/full-route actions.
edit(
  'src/ui/NavBar.tsx',
  "import type { PlayaPalette } from '../map/style'\n",
  "import type { PlayaPalette } from '../map/style'\nimport type { PlayaRoute } from '../brc/routing'\nimport type { DirectionsMode } from '../data/directions'\n",
)
edit(
  'src/ui/NavBar.tsx',
  "  palette?: PlayaPalette\n}",
  "  palette?: PlayaPalette\n  fromLabel?: string\n  mode?: DirectionsMode\n  routeKind?: PlayaRoute['kind']\n  liveOrigin?: boolean\n  onEdit?: () => void\n  onShowRoute?: () => void\n}",
)
edit(
  'src/ui/NavBar.tsx',
  "  palette,\n}: Props) {",
  "  palette,\n  fromLabel,\n  mode = 'walk',\n  routeKind = 'direct',\n  liveOrigin = true,\n  onEdit,\n  onShowRoute,\n}: Props) {",
)
edit(
  'src/ui/NavBar.tsx',
  `          <Stack direction=\"row\" spacing={0.4} sx={{ alignItems: 'center' }}>\n            <DirectionsWalkIcon fontSize=\"inherit\" />\n            <Typography variant=\"body2\">{formatMinutes(travel.walkMinutes)}</Typography>\n          </Stack>\n          <Stack direction=\"row\" spacing={0.4} sx={{ alignItems: 'center' }}>\n            <DirectionsBikeIcon fontSize=\"inherit\" />\n            <Typography variant=\"body2\">{formatMinutes(travel.bikeMinutes)}</Typography>\n          </Stack>\n`,
  `          <Stack direction=\"row\" spacing={0.4} sx={{ alignItems: 'center' }}>\n            {mode === 'walk' ? <DirectionsWalkIcon fontSize=\"inherit\" /> : <DirectionsBikeIcon fontSize=\"inherit\" />}\n            <Typography variant=\"body2\" sx={{ fontWeight: 700 }}>\n              {formatMinutes(mode === 'walk' ? travel.walkMinutes : travel.bikeMinutes)}\n            </Typography>\n          </Stack>\n`,
)
edit(
  'src/ui/NavBar.tsx',
  `          {located ? (\n            // \"Head toward 4:30\" is the one instruction you can follow without\n            // looking at the screen again, which is the whole reason the heading\n            // is given as a clock position. It should not be the quietest thing\n            // in the row.\n            <Typography\n              variant=\"body2\"\n              noWrap\n              sx={{ fontWeight: 700, color: 'primary.main' }}\n            >\n              toward {heading}\n            </Typography>\n          ) : (\n            <Typography variant=\"body2\" noWrap>\n              {status === 'locating'\n                ? 'finding you…'\n                : status === 'denied'\n                  ? \`\${address ?? heading} · from the Man (location off)\`\n                  : \`\${address ?? heading} · from the Man\`}\n            </Typography>\n          )}\n`,
  `          <Typography variant=\"body2\" noWrap sx={{ fontWeight: 700, color: 'primary.main' }}>\n            toward {heading}\n          </Typography>\n`,
)
edit(
  'src/ui/NavBar.tsx',
  `        <Typography variant=\"caption\" color=\"text.secondary\" sx={{ display: 'block', lineHeight: 1.2, mt: 0.25 }}>\n          Straight-line estimate — follow streets around occupied blocks\n        </Typography>\n`,
  `        {fromLabel && (\n          <Typography variant=\"caption\" color=\"text.secondary\" sx={{ display: 'block', lineHeight: 1.2, mt: 0.25 }}>\n            From {fromLabel}\n          </Typography>\n        )}\n        <Typography variant=\"caption\" color=\"text.secondary\" sx={{ display: 'block', lineHeight: 1.2, mt: 0.25 }}>\n          {routeKind === 'street'\n            ? 'Surveyed street route around occupied blocks'\n            : routeKind === 'hybrid'\n              ? 'Surveyed streets plus a direct open-playa leg'\n              : 'Straight-line estimate — verify a walkable path around occupied blocks'}\n        </Typography>\n        {(onEdit || onShowRoute) && (\n          <Stack direction=\"row\" spacing={0.5} sx={{ mt: 0.25 }}>\n            {onEdit && <Button size=\"small\" variant=\"text\" onClick={onEdit}>Edit route</Button>}\n            {onShowRoute && <Button size=\"small\" variant=\"text\" onClick={onShowRoute}>Show full route</Button>}\n          </Stack>\n        )}\n`,
)
edit(
  'src/ui/NavBar.tsx',
  "        {located && accuracy != null && (\n",
  "        {liveOrigin && located && accuracy != null && (\n",
)
edit(
  'src/ui/NavBar.tsx',
  "        {(status === 'denied' || status === 'unavailable') && (\n",
  "        {liveOrigin && (status === 'denied' || status === 'unavailable') && (\n",
)

// App: compute route geometry/ETA, manage planning location ownership, route-card sharing and full-route framing.
edit(
  'src/App.tsx',
  "import { travelBetween } from './brc/travel'\n",
  "import { travelForMeters } from './brc/travel'\nimport { routeBetween, type PlayaRoute } from './brc/routing'\n",
)
edit(
  'src/App.tsx',
  "import { resolveDirectionsRoute } from './data/directionsRuntime'\n",
  "import { resolveDirectionsRoute } from './data/directionsRuntime'\nimport { shareRouteCard } from './ui/routeCard'\n",
)
edit(
  'src/App.tsx',
  `export function boundsOf(a: Position, b: Position): [Position, Position] {\n  return [\n    [Math.min(a[0], b[0]), Math.min(a[1], b[1])],\n    [Math.max(a[0], b[0]), Math.max(a[1], b[1])],\n  ]\n}\n`,
  `export function boundsOf(a: Position, b: Position): [Position, Position] {\n  return [\n    [Math.min(a[0], b[0]), Math.min(a[1], b[1])],\n    [Math.max(a[0], b[0]), Math.max(a[1], b[1])],\n  ]\n}\n\nexport function boundsOfPositions(points: readonly Position[]): [Position, Position] {\n  if (!points.length) throw new Error('Cannot frame an empty route')\n  let west = points[0][0]\n  let east = points[0][0]\n  let south = points[0][1]\n  let north = points[0][1]\n  for (const [lng, lat] of points.slice(1)) {\n    west = Math.min(west, lng)\n    east = Math.max(east, lng)\n    south = Math.min(south, lat)\n    north = Math.max(north, lat)\n  }\n  return [[west, south], [east, north]]\n}\n`,
)
edit(
  'src/App.tsx',
  "    liveOrigin?: boolean\n  }>()\n",
  "    liveOrigin?: boolean\n    mode?: DirectionsMode\n  }>()\n",
)
edit(
  'src/App.tsx',
  "  const locationOwners = useRef<Set<'navigation' | 'events' | 'map' | 'nearest'>>(new Set())\n",
  "  type LocationOwner = 'navigation' | 'directions' | 'events' | 'map' | 'nearest'\n  const locationOwners = useRef<Set<LocationOwner>>(new Set())\n",
)
edit(
  'src/App.tsx',
  "    (owner: 'navigation' | 'events' | 'map' | 'nearest', initialFix?: GeolocationPosition) => {\n",
  "    (owner: LocationOwner, initialFix?: GeolocationPosition) => {\n",
)
edit(
  'src/App.tsx',
  "    (owner: 'navigation' | 'events' | 'map' | 'nearest') => {\n",
  "    (owner: LocationOwner) => {\n",
)
edit(
  'src/App.tsx',
  `  const openDirections = useCallback(() => {\n    setDirectionsFrom(defaultDirectionsOrigin(Boolean(usableFix)))\n    setDirectionsOpen(true)\n  }, [usableFix])\n`,
  `  const openDirections = useCallback(() => {\n    if (usableFix) {\n      setDirectionsFrom({ kind: 'live' })\n    } else if (location.status === 'idle' || location.status === 'locating') {\n      setDirectionsFrom({ kind: 'live' })\n      acquireLocation('directions')\n    } else {\n      setDirectionsFrom({ kind: 'man' })\n      releaseLocation('directions')\n    }\n    setDirectionsOpen(true)\n  }, [acquireLocation, location.status, releaseLocation, usableFix])\n\n  const closeDirections = useCallback(() => {\n    setDirectionsOpen(false)\n    releaseLocation('directions')\n  }, [releaseLocation])\n\n  const changeDirectionsFrom = useCallback((endpoint: DirectionsEndpoint) => {\n    setDirectionsFrom(endpoint)\n    if (endpoint.kind === 'live') acquireLocation('directions')\n    else releaseLocation('directions')\n  }, [acquireLocation, releaseLocation])\n\n  useEffect(() => {\n    if (!directionsOpen || directionsFrom.kind !== 'live' || usableFix) return\n    const outsideCity = location.status === 'tracking' && Boolean(here)\n    if (location.status === 'denied' || location.status === 'unavailable' || outsideCity) {\n      queueMicrotask(() => {\n        setDirectionsFrom({ kind: 'man' })\n        releaseLocation('directions')\n      })\n    }\n  }, [directionsFrom.kind, directionsOpen, here, location.status, releaseLocation, usableFix])\n`,
)
edit(
  'src/App.tsx',
  `  const liveAddressLabel = usableFix && data ? reverseGeocode(usableFix, data.layout).label : undefined\n\n  const navigation = useMemo(() => {\n    if (!heading || !origin || !data) return undefined\n    const bearing = bearingBetween(origin, heading.position)\n    return {\n      travel: travelBetween(origin, heading.position),\n      clock: bearingToClock(data.layout, bearing),\n      // Kept alongside the clock string rather than recomputed: it's the same\n      // bearing, and it's what the device-heading compass needle needs\n      // (#63) — \`needleAngle(bearing, deviceHeading)\` in NavBar/CompassNeedle.\n      bearing,\n    }\n  }, [heading, origin, data])\n`,
  `  const liveAddressLabel = usableFix && data ? reverseGeocode(usableFix, data.layout).label : undefined\n\n  const directionsPreview = useMemo(() => {\n    if (!data || !directionsTo) return undefined\n    const resolved = resolveDirectionsRoute(directionsFrom, directionsTo, {\n      layout: data.layout,\n      pois: data.pois,\n      livePosition: usableFix,\n    })\n    if (!resolved) return undefined\n    const route = routeBetween(data.layout, resolved.from.position, resolved.to.position)\n    const firstLeg = route.coordinates[1] ?? resolved.to.position\n    const bearing = bearingBetween(resolved.from.position, firstLeg)\n    return {\n      resolved,\n      route,\n      travel: travelForMeters(route.meters),\n      heading: bearingToClock(data.layout, bearing),\n    }\n  }, [data, directionsFrom, directionsTo, usableFix])\n\n  const navigation = useMemo(() => {\n    if (!heading || !origin || !data) return undefined\n    const route = routeBetween(data.layout, origin, heading.position)\n    const firstLeg = route.coordinates[1] ?? heading.position\n    const bearing = bearingBetween(origin, firstLeg)\n    return {\n      route,\n      travel: travelForMeters(route.meters),\n      clock: bearingToClock(data.layout, bearing),\n      bearing,\n    }\n  }, [heading, origin, data])\n`,
)
edit(
  'src/App.tsx',
  "      liveOrigin: route.from.dynamic,\n    })\n",
  "      liveOrigin: route.from.dynamic,\n      mode: directionsMode,\n    })\n",
)
edit(
  'src/App.tsx',
  `    setDirectionsOpen(false)\n    mapRef.current?.fitBounds([route.from.position, route.to.position], {\n`,
  `    setDirectionsOpen(false)\n    releaseLocation('directions')\n    const routed = routeBetween(data.layout, route.from.position, route.to.position)\n    mapRef.current?.fitBounds(boundsOfPositions(routed.coordinates), {\n`,
)
edit(
  'src/App.tsx',
  `  const shareDirections = useCallback(async () => {\n    if (!directionsTo) return\n    const result = await shareLink(\n      directionsUrl({ version: 1, from: directionsFrom, to: directionsTo, mode: directionsMode }),\n      'Dust Compass directions',\n    )\n    if (result === 'copied') setProbe('Route link copied')\n    else if (result === 'unavailable') setProbe('Could not copy the route link')\n  }, [directionsFrom, directionsMode, directionsTo])\n`,
  `  const shareDirections = useCallback(async () => {\n    if (!directionsTo) return\n    const result = await shareLink(\n      directionsUrl({ version: 1, from: directionsFrom, to: directionsTo, mode: directionsMode }),\n      'Dust Compass directions',\n    )\n    if (result === 'copied') setProbe('Route link copied')\n    else if (result === 'unavailable') setProbe('Could not copy the route link')\n  }, [directionsFrom, directionsMode, directionsTo])\n\n  const shareDirectionsImage = useCallback(async () => {\n    if (!directionsPreview) return\n    try {\n      const result = await shareRouteCard({\n        fromLabel: directionsPreview.resolved.from.label,\n        toLabel: directionsPreview.resolved.to.label,\n        toDetail: directionsPreview.resolved.to.detail,\n        route: directionsPreview.route,\n        mode: directionsMode,\n        heading: directionsPreview.heading,\n        approximate: directionsPreview.resolved.to.endpoint.kind === 'address',\n      })\n      setProbe(result === 'shared' ? 'Route card shared' : result === 'copied' ? 'Route card copied' : 'Route card downloaded')\n    } catch {\n      setProbe('Could not create the route card')\n    }\n  }, [directionsMode, directionsPreview])\n`,
)
edit(
  'src/App.tsx',
  `  const swapDirections = useCallback(() => {\n    if (!directionsTo) return\n    const previousFrom = directionsFrom\n    setDirectionsFrom(directionsTo)\n    setDirectionsTo(previousFrom)\n  }, [directionsFrom, directionsTo])\n`,
  `  const swapDirections = useCallback(() => {\n    if (!directionsTo) return\n    const previousFrom = directionsFrom\n    setDirectionsFrom(directionsTo)\n    setDirectionsTo(previousFrom)\n    if (directionsTo.kind === 'live') acquireLocation('directions')\n    else releaseLocation('directions')\n  }, [acquireLocation, directionsFrom, directionsTo, releaseLocation])\n`,
)
edit(
  'src/App.tsx',
  "        liveOrigin: true,\n      })\n",
  "        liveOrigin: true,\n        mode: directionsMode,\n      })\n",
)
edit(
  'src/App.tsx',
  "    [acquireLocation, navigationPadding, usableFix],\n  )\n",
  "    [acquireLocation, directionsMode, navigationPadding, usableFix],\n  )\n",
)
edit(
  'src/App.tsx',
  `    if (!heading) {\n      framedNavigationFor.current = undefined\n      return\n    }\n    const key = \`\${heading.position[0]},\${heading.position[1]}\`\n`,
  `    if (!heading) {\n      framedNavigationFor.current = undefined\n      return\n    }\n    if (!heading.liveOrigin) return\n    const key = \`\${heading.position[0]},\${heading.position[1]}\`\n`,
)
edit(
  'src/App.tsx',
  `  const flyTo = useCallback(\n`,
  `  const framedDirectionsFor = useRef<string | undefined>(undefined)\n  useEffect(() => {\n    if (!directionsOpen || !directionsPreview) {\n      framedDirectionsFor.current = undefined\n      return\n    }\n    const key = JSON.stringify([directionsFrom, directionsTo])\n    if (framedDirectionsFor.current === key) return\n    framedDirectionsFor.current = key\n    mapRef.current?.fitBounds(boundsOfPositions(directionsPreview.route.coordinates), {\n      padding: navigationPadding(), duration: 650, maxZoom: 16.5,\n    })\n  }, [directionsFrom, directionsOpen, directionsPreview, directionsTo, navigationPadding])\n\n  const showFullRoute = useCallback(() => {\n    if (!navigation) return\n    mapRef.current?.fitBounds(boundsOfPositions(navigation.route.coordinates), {\n      padding: navigationPadding(), duration: 650, maxZoom: 16.5,\n    })\n  }, [navigation, navigationPadding])\n\n  const editCurrentRoute = useCallback(() => {\n    setDirectionsOpen(true)\n    if (directionsFrom.kind === 'live') acquireLocation('directions')\n  }, [acquireLocation, directionsFrom.kind])\n\n  const flyTo = useCallback(\n`,
)
edit(
  'src/App.tsx',
  `                route={heading && here && origin ? { from: origin, to: heading.position } : undefined}\n                selected={selected}\n`,
  `                route={\n                  heading\n                    ? (heading.liveOrigin && !usableFix ? undefined : navigation?.route)\n                    : directionsOpen ? directionsPreview?.route : undefined\n                }\n                routeStart={!heading && directionsOpen ? directionsPreview?.resolved.from.position : undefined}\n                routeEnd={!heading && directionsOpen ? directionsPreview?.resolved.to.position : undefined}\n                selected={selected}\n`,
)
edit(
  'src/App.tsx',
  `                  located={Boolean(usableFix)}\n                  status={location.status}\n`,
  `                  located={Boolean(heading.liveOrigin && usableFix)}\n                  liveOrigin={Boolean(heading.liveOrigin)}\n                  fromLabel={originLabel}\n                  mode={heading.mode ?? directionsMode}\n                  routeKind={navigation.route.kind}\n                  status={location.status}\n`,
)
edit(
  'src/App.tsx',
  `                  onRetryLocation={retryNavigationLocation}\n                  onClear={() => {\n`,
  `                  onRetryLocation={retryNavigationLocation}\n                  onEdit={editCurrentRoute}\n                  onShowRoute={showFullRoute}\n                  onClear={() => {\n`,
)
edit(
  'src/App.tsx',
  `          pois={data.pois}\n          places={places}\n          from={directionsFrom}\n`,
  `          pois={data.pois}\n          events={data.events}\n          places={places}\n          droppedPin={pin}\n          from={directionsFrom}\n`,
)
edit(
  'src/App.tsx',
  `          findingLocation={location.status === 'locating'}\n          onFromChange={setDirectionsFrom}\n`,
  `          findingLocation={location.status === 'locating'}\n          preview={directionsPreview ? {\n            fromLabel: directionsPreview.resolved.from.label,\n            toLabel: directionsPreview.resolved.to.label,\n            toDetail: directionsPreview.resolved.to.detail,\n            route: directionsPreview.route,\n            travel: directionsPreview.travel,\n            heading: directionsPreview.heading,\n          } : undefined}\n          onFromChange={changeDirectionsFrom}\n`,
)
edit(
  'src/App.tsx',
  `          onShare={() => void shareDirections()}\n          onClose={() => setDirectionsOpen(false)}\n`,
  `          onShare={() => void shareDirections()}\n          onShareImage={() => void shareDirectionsImage()}\n          onClose={closeDirections}\n`,
)

// Add focused tests for route bounding and routed NavBar semantics.
const navTest = fs.readFileSync('src/ui/__tests__/NavBar.test.tsx', 'utf8')
fs.writeFileSync(
  'src/ui/__tests__/NavBar.test.tsx',
  navTest.replace(
    `      <NavBar\n        name=\"Center Camp\"\n        travel={travel}\n        heading=\"6:00\"\n`,
    `      <NavBar\n        name=\"Center Camp\"\n        travel={travel}\n        heading=\"6:00\"\n`,
  ) + `\n\ndescribe('NavBar routed directions summary (#132)', () => {\n  it('uses the selected bike ETA and names surveyed street routing', () => {\n    render(\n      <ThemeProvider theme={playaTheme('dark')}>\n        <NavBar\n          name=\"Center Camp\" travel={travel} heading=\"6:00\" located={false} status=\"idle\"\n          fromLabel=\"7:30 & B\" mode=\"bike\" routeKind=\"street\" liveOrigin={false}\n          onRetryLocation={vi.fn()} onClear={vi.fn()}\n        />\n      </ThemeProvider>,\n    )\n    expect(screen.getByText(/Surveyed street route/i)).toBeDefined()\n    expect(screen.getByText(/From 7:30 & B/i)).toBeDefined()\n    expect(screen.getByText('2 min')).toBeDefined()\n    expect(screen.queryByText('4 min')).toBeNull()\n  })\n})\n`,
)

// Browser smoke coverage for the core planning/edit/share-link round-trip. Insert
// before the existing browser.close so it runs against the exact production artifact.
edit(
  'scripts/smoke.mjs',
  `await browser.close()\n`,
  `// First-class Directions: dedicated entry, editable endpoints, mode, URL round-trip.\nawait page.getByRole('button', { name: 'Directions', exact: true }).first().click()\nawait page.getByRole('heading', { name: 'Directions' }).waitFor({ timeout: 5000 })\nconst toField = page.getByRole('combobox', { name: 'To' })\nawait toField.fill('7:30 & Esplanade')\nawait page.getByRole('option').filter({ hasText: /7:30.*Esplanade|Esplanade.*7:30/ }).first().click()\nawait page.getByTestId('directions-summary').waitFor({ timeout: 5000 })\nawait page.getByRole('button', { name: /Bike/i }).click()\nawait page.getByRole('button', { name: /Share link/i }).click()\nawait page.waitForTimeout(250)\nconst routeUrl = page.url()\nassert(new URL(routeUrl).searchParams.get('dir') === '1', 'Directions share URL carries schema version')\nassert(new URL(routeUrl).searchParams.get('mode') === 'bike', 'Directions share URL carries selected mode')\nconst sharedRoute = await context.newPage()\nawait sharedRoute.goto(routeUrl, { waitUntil: 'load' })\nawait sharedRoute.waitForFunction(() => window.__map, null, { timeout: 30000 })\nawait sharedRoute.getByRole('heading', { name: 'Directions' }).waitFor({ timeout: 5000 })\nassert((await sharedRoute.getByTestId('directions-summary').count()) === 1, 'shared Directions URL restores route summary')\nawait sharedRoute.close()\n\nawait browser.close()\n`,
)

// Human E2E coverage is production-only and carries state/offline semantics. Add
// a dedicated route journey before the on-playa context closes.
edit(
  'scripts/human-e2e-live.mjs',
  `  await context.close()\n}\n\n// Journey 3: desktop planning with the keyboard rather than phone controls.\n`,
  `  await journey(page, 'directions plans edits swaps shares and restarts as one human task', async () => {\n    await page.getByRole('button', { name: 'Directions', exact: true }).first().click()\n    await page.getByRole('heading', { name: 'Directions' }).waitFor({ timeout: 5000 })\n    const from = page.getByRole('combobox', { name: 'From' })\n    const to = page.getByRole('combobox', { name: 'To' })\n    assert((await from.inputValue()).length > 0, 'Directions opened without a visible start')\n    await to.fill(fixture.name)\n    await page.getByRole('option').filter({ hasText: fixture.name }).first().click()\n    const summary = page.getByTestId('directions-summary')\n    await summary.waitFor({ timeout: 10000 })\n    assert(/surveyed|open-playa|straight-line/i.test(await summary.innerText()), 'route semantics are missing')\n    await page.getByRole('button', { name: /Bike/i }).click()\n    await page.getByLabel('Swap directions endpoints').click()\n    assert((await page.getByRole('combobox', { name: 'From' }).inputValue()).includes(fixture.name), 'swap did not move destination into From')\n    await page.getByLabel('Swap directions endpoints').click()\n    await page.getByRole('button', { name: /Share link/i }).click()\n    await page.getByText(/Route link copied|Could not copy the route link/).waitFor({ timeout: 5000 })\n    const params = new URL(page.url()).searchParams\n    assert(params.get('dir') === '1' && params.get('mode') === 'bike', 'route link did not preserve Directions intent')\n    assert(!(params.get('from') ?? '').includes('-119.'), 'live start leaked a raw longitude into the shared URL')\n    await page.getByRole('button', { name: /Start navigation/i }).click()\n    await page.getByTestId('navigation-bar').waitFor({ timeout: 10000 })\n    await page.getByRole('button', { name: /Edit route/i }).click()\n    await page.getByRole('heading', { name: 'Directions' }).waitFor({ timeout: 5000 })\n    await page.getByRole('button', { name: /Close directions/i }).click()\n    await page.getByRole('button', { name: /Show full route/i }).click()\n    await page.getByLabel('Stop navigating').click()\n  })\n\n  await journey(page, 'shared fixed directions reopen while offline after preparation', async () => {\n    const fixed = \`\${BASE_URL}?dir=1&from=man&to=at%3A7%253A30%2520%2526%2520Esplanade&mode=walk\`\n    await page.goto(fixed, { waitUntil: 'load' })\n    await waitForMap(page)\n    await page.getByRole('heading', { name: 'Directions' }).waitFor({ timeout: 5000 })\n    await context.setOffline(true)\n    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })\n    await waitForMap(page)\n    await page.getByRole('heading', { name: 'Directions' }).waitFor({ timeout: 5000 })\n    await context.setOffline(false)\n  })\n\n  await context.close()\n}\n\n// Journey 3: desktop planning with the keyboard rather than phone controls.\n`,
)

// The helper and workflow are one-shot scaffolding, never product code.
fs.rmSync('scripts/finish-directions-wiring.mjs')
fs.rmSync('.github/workflows/finish-directions-wiring.yml')
