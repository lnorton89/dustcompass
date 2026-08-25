import fs from 'node:fs'

function edit(path, needle, replacement) {
  const before = fs.readFileSync(path, 'utf8')
  if (!before.includes(needle)) throw new Error(`${path}: missing needle: ${needle.slice(0, 120)}`)
  fs.writeFileSync(path, before.replace(needle, replacement))
}

edit(
  'src/App.tsx',
  "import { bearingToClock, bearingBetween, bearingsMatch, isNearCity } from './brc/geo'\n",
  "import { bearingToClock, bearingBetween, bearingsMatch, distanceBetween, isNearCity } from './brc/geo'\n",
)

// A restored shared `from=live` route opens the editor directly rather than
// going through openDirections(), so it must start the GPS owner itself.
edit(
  'src/App.tsx',
  `  useEffect(() => {\n    if (!directionsOpen || directionsFrom.kind !== 'live' || usableFix) return\n    const outsideCity = location.status === 'tracking' && Boolean(here)\n`,
  `  useEffect(() => {\n    if (!directionsOpen || directionsFrom.kind !== 'live' || usableFix) return\n    if (location.status === 'idle') {\n      acquireLocation('directions')\n      return\n    }\n    const outsideCity = location.status === 'tracking' && Boolean(here)\n`,
)
edit(
  'src/App.tsx',
  `  }, [directionsFrom.kind, directionsOpen, here, location.status, releaseLocation, usableFix])\n`,
  `  }, [acquireLocation, directionsFrom.kind, directionsOpen, here, location.status, releaseLocation, usableFix])\n`,
)

// Arrival is a physical proximity question, not a routed-distance question.
// Someone standing at a camp 30m inside a block may still have a route that
// goes out to the street and back; that must not prevent the arrival haptic.
edit(
  'src/App.tsx',
  `    if (\n      !canConfirmArrival(\n        navigation.travel.meters,\n        Boolean(heading?.liveOrigin && usableFix),\n        location.accuracy,\n      )\n    ) return\n`,
  `    const arrivalMeters = heading?.liveOrigin && usableFix\n      ? distanceBetween(usableFix, heading.position)\n      : Infinity\n    if (\n      !canConfirmArrival(\n        arrivalMeters,\n        Boolean(heading?.liveOrigin && usableFix),\n        location.accuracy,\n      )\n    ) return\n`,
)
edit(
  'src/App.tsx',
  `  }, [navigation, heading?.liveOrigin, usableFix, location.accuracy])\n`,
  `  }, [navigation, heading, usableFix, location.accuracy])\n`,
)

// startDirections reads the selected mode when it promotes preview to active nav.
edit(
  'src/App.tsx',
  `    directionsFrom,\n    directionsTo,\n    navigationPadding,\n`,
  `    directionsFrom,\n    directionsMode,\n    directionsTo,\n    navigationPadding,\n`,
)

// Route-link browser coverage includes the annual data identity and actually
// exercises route-card generation/fallback, not just its pure layout function.
edit(
  'scripts/smoke.mjs',
  `assert(new URL(routeUrl).searchParams.get('dir') === '1', 'Directions share URL carries schema version')\nassert(new URL(routeUrl).searchParams.get('mode') === 'bike', 'Directions share URL carries selected mode')\n`,
  `assert(new URL(routeUrl).searchParams.get('dir') === '1', 'Directions share URL carries schema version')\nassert(new URL(routeUrl).searchParams.get('year') === '2026', 'Directions share URL carries annual data version')\nassert(new URL(routeUrl).searchParams.get('mode') === 'bike', 'Directions share URL carries selected mode')\nconst routeCardDownload = page.waitForEvent('download', { timeout: 6000 }).catch(() => undefined)\nawait page.getByRole('button', { name: /Route card/i }).click()\nconst routeDownload = await routeCardDownload\nif (routeDownload) {\n  assert(routeDownload.suggestedFilename().endsWith('.png'), 'route card fallback downloads a PNG')\n} else {\n  await page.getByText(/Route card (shared|copied)/).waitFor({ timeout: 6000 })\n}\n`,
)

// Human production journeys use the final year-versioned link shape.
edit(
  'scripts/human-e2e-live.mjs',
  `    assert(params.get('dir') === '1' && params.get('mode') === 'bike', 'route link did not preserve Directions intent')\n`,
  `    assert(params.get('dir') === '1' && params.get('year') === '2026' && params.get('mode') === 'bike', 'route link did not preserve Directions intent')\n`,
)
edit(
  'scripts/human-e2e-live.mjs',
  "    const fixed = `${BASE_URL}?dir=1&from=man&to=at%3A7%253A30%2520%2526%2520Esplanade&mode=walk`\n",
  "    const fixed = `${BASE_URL}?dir=1&year=2026&from=man&to=at%3A7%3A30%20%26%20Esplanade&mode=walk`\n",
)

fs.rmSync('scripts/final-directions-corrections.mjs')
fs.rmSync('.github/workflows/final-directions-corrections.yml')
