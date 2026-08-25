import fs from 'node:fs'

const path = 'src/App.tsx'
let source = fs.readFileSync(path, 'utf8')

function replaceExactly(from, to) {
  if (!source.includes(from)) throw new Error(`App.tsx pattern not found:\n${from.slice(0, 180)}`)
  source = source.replace(from, to)
}

replaceExactly(
  "import EventIcon from '@mui/icons-material/Event'\n",
  "import EventIcon from '@mui/icons-material/Event'\nimport DirectionsIcon from '@mui/icons-material/Directions'\n",
)
replaceExactly(
  "import { haptic } from './ui/haptics'\n",
  "import { haptic } from './ui/haptics'\nimport { DirectionsPanel } from './ui/DirectionsPanel'\nimport {\n  defaultDirectionsOrigin,\n  directionsUrl,\n  readDirectionsIntent,\n  type DirectionsEndpoint,\n  type DirectionsMode,\n} from './data/directions'\nimport { resolveDirectionsRoute } from './data/directionsRuntime'\n",
)

replaceExactly(
  "    /** Present when heading to a listed camp/art piece, so the URL can name it. */\n    uid?: string\n  }>()\n",
  "    /** Present when heading to a listed camp/art piece, so the URL can name it. */\n    uid?: string\n    /** Fixed planning origins stay fixed; live origins continue following GPS. */\n    origin?: Position\n    originLabel?: string\n    liveOrigin?: boolean\n  }>()\n  const [initialDirections] = useState(() => readDirectionsIntent())\n  const [directionsOpen, setDirectionsOpen] = useState(() => Boolean(initialDirections))\n  const [directionsFrom, setDirectionsFrom] = useState<DirectionsEndpoint>(\n    () => initialDirections?.from ?? { kind: 'man' },\n  )\n  const [directionsTo, setDirectionsTo] = useState<DirectionsEndpoint | undefined>(\n    () => initialDirections?.to,\n  )\n  const [directionsMode, setDirectionsMode] = useState<DirectionsMode>(\n    () => initialDirections?.mode ?? 'walk',\n  )\n",
)

replaceExactly(
  "    if (staleLink) return\n    if (selected) publish({ poi: selected.uid })",
  "    if (staleLink) return\n    // Directions owns the query string while its editor is open. A separate\n    // effect below mirrors the complete versioned route intent; letting the\n    // legacy POI/pin publisher run here would erase `dir/from/to/mode` from a\n    // cold shared route before the reader could act on it.\n    if (directionsOpen) return\n    if (selected) publish({ poi: selected.uid })",
)
replaceExactly(
  "  }, [data, selected, unplaced, heading, pin, publish, linkKey, restoredLink, staleLink])\n",
  "  }, [\n    data,\n    selected,\n    unplaced,\n    heading,\n    pin,\n    publish,\n    linkKey,\n    restoredLink,\n    staleLink,\n    directionsOpen,\n  ])\n\n  useEffect(() => {\n    if (!directionsOpen || !directionsTo) return\n    const next = directionsUrl({\n      version: 1,\n      from: directionsFrom,\n      to: directionsTo,\n      mode: directionsMode,\n    })\n    if (next !== window.location.href) window.history.replaceState(null, '', next)\n  }, [directionsOpen, directionsFrom, directionsTo, directionsMode])\n",
)

replaceExactly(
  "  const usableFix = here && data && isNearCity(data.layout, here) ? here : undefined\n",
  "  const usableFix = here && data && isNearCity(data.layout, here) ? here : undefined\n  const openDirections = useCallback(() => {\n    setDirectionsFrom(defaultDirectionsOrigin(Boolean(usableFix)))\n    setDirectionsOpen(true)\n  }, [usableFix])\n",
)

replaceExactly(
  "  const origin = usableFix ?? (data?.layout.center.geometry.coordinates as Position | undefined)\n  const originLabel = usableFix\n    ? data\n      ? `you (${reverseGeocode(usableFix, data.layout).label})`\n      : 'you'\n    : 'the Man'\n",
  "  const manPosition = data?.layout.center.geometry.coordinates as Position | undefined\n  const origin = heading?.liveOrigin\n    ? (usableFix ?? manPosition)\n    : (heading?.origin ?? usableFix ?? manPosition)\n  const originLabel = heading?.originLabel\n    ?? (usableFix\n      ? data\n        ? `you (${reverseGeocode(usableFix, data.layout).label})`\n        : 'you'\n      : 'the Man')\n",
)

replaceExactly(
  "    if (!canConfirmArrival(navigation.travel.meters, Boolean(usableFix), location.accuracy)) return\n",
  "    if (\n      !canConfirmArrival(\n        navigation.travel.meters,\n        Boolean(heading?.liveOrigin && usableFix),\n        location.accuracy,\n      )\n    ) return\n",
)
replaceExactly(
  "  }, [navigation, usableFix, location.accuracy])\n",
  "  }, [navigation, heading?.liveOrigin, usableFix, location.accuracy])\n",
)

replaceExactly(
  "  const framedNavigationFor = useRef<string | undefined>(undefined)\n  const navigateTo = useCallback(\n",
  "  const startDirections = useCallback(() => {\n    if (!data || !directionsTo) return\n    const route = resolveDirectionsRoute(directionsFrom, directionsTo, {\n      layout: data.layout,\n      pois: data.pois,\n      livePosition: usableFix,\n    })\n    if (!route) {\n      setProbe(\n        directionsFrom.kind === 'live'\n          ? 'Could not get a usable on-playa location. Choose The Man or another start.'\n          : 'Could not resolve one of those directions endpoints.',\n      )\n      return\n    }\n\n    setHeading({\n      name: route.to.label,\n      position: route.to.position,\n      address: route.to.detail,\n      approximate: route.to.endpoint.kind === 'address',\n      uid: route.to.endpoint.kind === 'poi' ? route.to.endpoint.uid : undefined,\n      origin: route.from.dynamic ? undefined : route.from.position,\n      originLabel: route.from.label,\n      liveOrigin: route.from.dynamic,\n    })\n    arrived.current = false\n    setSelected(undefined)\n    setPin(undefined)\n    setDirectionsOpen(false)\n    mapRef.current?.fitBounds([route.from.position, route.to.position], {\n      padding: navigationPadding(),\n      duration: 900,\n      maxZoom: 16.5,\n    })\n    framedNavigationFor.current = `${route.to.position[0]},${route.to.position[1]}`\n    if (route.from.dynamic) acquireLocation('navigation')\n    else releaseLocation('navigation')\n  }, [\n    acquireLocation,\n    data,\n    directionsFrom,\n    directionsTo,\n    navigationPadding,\n    releaseLocation,\n    usableFix,\n  ])\n\n  const shareDirections = useCallback(async () => {\n    if (!directionsTo) return\n    const result = await shareLink(\n      directionsUrl({ version: 1, from: directionsFrom, to: directionsTo, mode: directionsMode }),\n      'Dust Compass directions',\n    )\n    if (result === 'copied') setProbe('Route link copied')\n    else if (result === 'unavailable') setProbe('Could not copy the route link')\n  }, [directionsFrom, directionsMode, directionsTo])\n\n  const swapDirections = useCallback(() => {\n    if (!directionsTo) return\n    const previousFrom = directionsFrom\n    setDirectionsFrom(directionsTo)\n    setDirectionsTo(previousFrom)\n  }, [directionsFrom, directionsTo])\n\n  const framedNavigationFor = useRef<string | undefined>(undefined)\n  const navigateTo = useCallback(\n",
)

replaceExactly(
  "    }) => {\n      setHeading({\n        name: target.name,",
  "    }) => {\n      setDirectionsFrom(defaultDirectionsOrigin(Boolean(usableFix)))\n      setDirectionsTo(\n        target.uid\n          ? { kind: 'poi', uid: target.uid }\n          : target.address\n            ? { kind: 'address', address: target.address, position: target.position }\n            : { kind: 'fixed', label: target.name, position: target.position },\n      )\n      setDirectionsOpen(false)\n      setHeading({\n        name: target.name,",
)
replaceExactly(
  "        uid: target.uid,\n      })",
  "        uid: target.uid,\n        liveOrigin: true,\n      })",
)

replaceExactly(
  "                    <ControlButton\n                      icon={<EventIcon />}\n                      title=\"Show events\"",
  "                    <ControlButton\n                      icon={<DirectionsIcon />}\n                      title=\"Directions\"\n                      tooltip=\"Directions\"\n                      selected={directionsOpen}\n                      pressed={directionsOpen}\n                      onClick={openDirections}\n                    />\n                    <ControlButton\n                      icon={<EventIcon />}\n                      title=\"Show events\"",
)

replaceExactly(
  "              {\n                key: 'events',\n                label: 'Events',",
  "              {\n                key: 'directions',\n                label: 'Directions',\n                title: 'Directions',\n                icon: <DirectionsIcon />,\n                selected: directionsOpen,\n                pressed: directionsOpen,\n                onClick: openDirections,\n              },\n              {\n                key: 'events',\n                label: 'Events',",
)

replaceExactly(
  "      <FirstRun />\n",
  "      {data && (\n        <DirectionsPanel\n          open={directionsOpen}\n          compact={compact}\n          layout={data.layout}\n          pois={data.pois}\n          places={places}\n          from={directionsFrom}\n          to={directionsTo}\n          mode={directionsMode}\n          hasUsableLiveFix={Boolean(usableFix)}\n          findingLocation={location.status === 'locating'}\n          onFromChange={setDirectionsFrom}\n          onToChange={setDirectionsTo}\n          onModeChange={setDirectionsMode}\n          onSwap={swapDirections}\n          onStart={startDirections}\n          onShare={() => void shareDirections()}\n          onClose={() => setDirectionsOpen(false)}\n        />\n      )}\n\n      <FirstRun />\n",
)

fs.writeFileSync(path, source)
fs.rmSync('scripts/apply-directions-app-wiring.mjs')
