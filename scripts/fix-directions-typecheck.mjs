import fs from 'node:fs'

function edit(path, needle, replacement) {
  const before = fs.readFileSync(path, 'utf8')
  if (!before.includes(needle)) throw new Error(`${path}: missing needle: ${needle.slice(0, 120)}`)
  fs.writeFileSync(path, before.replace(needle, replacement))
}

edit(
  'src/App.tsx',
  "import { routeBetween, type PlayaRoute } from './brc/routing'\n",
  "import { routeBetween } from './brc/routing'\n",
)

edit(
  'src/map/MapView.tsx',
  "import { Button, Stack, Typography } from '@mui/material'\n",
  "import { Box, Button, Stack, Typography } from '@mui/material'\n",
)

edit(
  'src/ui/NavBar.tsx',
  "  name,\n  address,\n  travel,\n",
  "  name,\n  travel,\n",
)

// Keep the legacy one-tap `Take me there` shortcut on the same origin model as
// the Directions editor: live while a usable/acquiring fix exists, fixed Man
// after a terminal/unusable location state.
edit(
  'src/App.tsx',
  `    }) => {\n      setDirectionsFrom(defaultDirectionsOrigin(Boolean(usableFix)))\n      setDirectionsTo(\n`,
  `    }) => {\n      const routeOrigin: DirectionsEndpoint = usableFix || location.status === 'idle' || location.status === 'locating'\n        ? { kind: 'live' }\n        : { kind: 'man' }\n      setDirectionsFrom(routeOrigin)\n      setDirectionsTo(\n`,
)
edit(
  'src/App.tsx',
  `        uid: target.uid,\n        liveOrigin: true,\n        mode: directionsMode,\n`,
  `        uid: target.uid,\n        liveOrigin: routeOrigin.kind === 'live',\n        mode: directionsMode,\n`,
)
edit(
  'src/App.tsx',
  `      acquireLocation('navigation')\n    },\n    [acquireLocation, directionsMode, navigationPadding, usableFix],\n  )\n`,
  `      if (routeOrigin.kind === 'live') acquireLocation('navigation')\n      else releaseLocation('navigation')\n    },\n    [acquireLocation, directionsMode, location.status, navigationPadding, releaseLocation, usableFix],\n  )\n`,
)

fs.rmSync('scripts/fix-directions-typecheck.mjs')
fs.rmSync('.github/workflows/fix-directions-typecheck.yml')
