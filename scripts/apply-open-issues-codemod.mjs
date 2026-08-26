import fs from 'node:fs'

function edit(path, changes) {
  let source = fs.readFileSync(path, 'utf8')
  for (const [from, to] of changes) {
    if (!source.includes(from)) throw new Error(`${path}: missing expected text: ${from.slice(0, 80)}`)
    source = source.replace(from, to)
  }
  fs.writeFileSync(path, source)
}

edit('src/App.tsx', [
  [
    "import { resolveDirectionsRoute } from './data/directionsRuntime'",
    "import { resolveDirectionsEndpoint, resolveDirectionsRoute } from './data/directionsRuntime'",
  ],
  [
    `  const directionsPreview = useMemo(() => {\n    if (!data || !directionsTo) return undefined`,
    `  const directionsDestinationResolved = useMemo(() => {\n    if (!data || !directionsTo) return false\n    return Boolean(resolveDirectionsEndpoint(directionsTo, {\n      layout: data.layout,\n      pois: data.pois,\n      livePosition: usableFix,\n    }))\n  }, [data, directionsTo, usableFix])\n\n  const directionsPreview = useMemo(() => {\n    if (!data || !directionsTo) return undefined`,
  ],
  [
    `  const shareDirections = useCallback(async () => {\n    if (!directionsTo) return`,
    `  const shareDirections = useCallback(async () => {\n    if (!directionsTo || !directionsDestinationResolved) {\n      if (directionsTo) setProbe('This destination is no longer available to share')\n      return\n    }`,
  ],
  [
    `  }, [directionsFrom, directionsMode, directionsTo])`,
    `  }, [directionsDestinationResolved, directionsFrom, directionsMode, directionsTo])`,
  ],
  [
    `          findingLocation={location.status === 'locating'}\n          preview={directionsPreview ? {`,
    `          findingLocation={location.status === 'locating'}\n          destinationResolved={directionsDestinationResolved}\n          preview={directionsPreview ? {`,
  ],
])

edit('src/ui/EventsPanel.tsx', [
  [
    "import type { SavedEvent } from '../data/useSavedEvents'",
    "import { savedEventMatches, type SavedEvent } from '../data/useSavedEvents'",
  ],
  [
    `      const event = byUid.get(saved.uid)\n      if (!event) continue`,
    `      const event = byUid.get(saved.uid)\n      if (!event || !savedEventMatches(saved, event)) continue`,
  ],
  [
    `    const presentUids = new Set(events.map((event) => event.uid))\n    const term = query.trim().toLowerCase()\n    return savedEvents.filter(\n      (saved) => !presentUids.has(saved.uid) && (!term || saved.title.toLowerCase().includes(term)),\n    )`,
    `    const byUid = new Map(events.map((event) => [event.uid, event] as const))\n    const term = query.trim().toLowerCase()\n    return savedEvents.filter((saved) => {\n      const current = byUid.get(saved.uid)\n      const missingOrReused = !current || !savedEventMatches(saved, current)\n      return missingOrReused && (!term || saved.title.toLowerCase().includes(term))\n    })`,
  ],
])
