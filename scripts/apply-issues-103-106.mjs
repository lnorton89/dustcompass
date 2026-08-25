import { readFile, writeFile, unlink } from 'node:fs/promises'

async function replace(path, before, after) {
  const source = await readFile(path, 'utf8')
  if (!source.includes(before)) throw new Error(`Expected source not found in ${path}`)
  await writeFile(path, source.replace(before, after))
}

await replace(
  'src/App.tsx',
  "  const acquireEventsLocation = useCallback(() => acquireLocation('events'), [acquireLocation])\n  const releaseEventsLocation = useCallback(() => releaseLocation('events'), [releaseLocation])",
  "  const acquireEventsLocation = useCallback(() => acquireLocation('events'), [acquireLocation])\n  const releaseEventsLocation = useCallback(() => releaseLocation('events'), [releaseLocation])\n  // Permission denial clears the ownership set because the underlying browser\n  // watch is terminally gone. Navigation itself remains active, though, so a\n  // retry must reacquire its ownership claim instead of bypassing the owner\n  // layer with location.start() directly (#103).\n  const retryNavigationLocation = useCallback(() => acquireLocation('navigation'), [acquireLocation])",
)

await replace(
  'src/App.tsx',
  '                  onRetryLocation={location.start}',
  '                  onRetryLocation={retryNavigationLocation}',
)

await replace(
  'src/App.tsx',
  "        onSave={(name) => {\n          if (saving) savePlace(name, saving.position, saving.address)\n          setSaving(undefined)\n          setProbe(`Saved \\\"${name}\\\"`)\n          // Usually done while already moving away from the thing being marked.\n          haptic('confirm')\n        }}",
  "        onSave={(name) => {\n          if (!saving) return\n          const result = savePlace(name, saving.position, saving.address)\n          setSaving(undefined)\n          if (result.persisted) {\n            setProbe(`Saved \\\"${name}\\\"`)\n            // Usually done while already moving away from the thing being marked.\n            haptic('confirm')\n          } else {\n            setProbe(`Saved \\\"${name}\\\" for this session only — browser storage is unavailable`)\n          }\n        }}",
)

await replace(
  'src/App.tsx',
  "          removePlace(id)\n          setDeletedPlace(place)\n          setProbe(`Removed “${place.name}”`)",
  "          const persisted = removePlace(id)\n          setDeletedPlace(place)\n          setProbe(\n            persisted\n              ? `Removed “${place.name}”`\n              : `Removed “${place.name}” for this session only — browser storage is unavailable`,\n          )",
)

await replace(
  'src/App.tsx',
  "          onToggleSaveEvent={(event) =>\n            isEventSaved(event.uid) ? removeSavedEvent(event.uid) : saveEvent(event)\n          }",
  "          onToggleSaveEvent={(event) => {\n            const persisted = isEventSaved(event.uid)\n              ? removeSavedEvent(event.uid)\n              : saveEvent(event)\n            if (!persisted) {\n              setProbe('Saved-event change is for this session only — browser storage is unavailable')\n            }\n          }}",
)

await replace(
  'src/App.tsx',
  "            if (isEventSaved(selectedEvent.uid)) removeSavedEvent(selectedEvent.uid)\n            else saveEvent(selectedEvent)",
  "            const persisted = isEventSaved(selectedEvent.uid)\n              ? removeSavedEvent(selectedEvent.uid)\n              : saveEvent(selectedEvent)\n            if (!persisted) {\n              setProbe('Saved-event change is for this session only — browser storage is unavailable')\n            }",
)

await replace(
  'src/App.tsx',
  "          deletedPlace && probe === `Removed “${deletedPlace.name}”` ? (",
  "          deletedPlace && probe?.startsWith(`Removed “${deletedPlace.name}”`) ? (",
)

await replace(
  'src/App.tsx',
  "                restorePlace(deletedPlace)\n                setProbe(`Restored “${deletedPlace.name}”`)\n                setDeletedPlace(undefined)",
  "                const persisted = restorePlace(deletedPlace)\n                setProbe(\n                  persisted\n                    ? `Restored “${deletedPlace.name}”`\n                    : `Restored “${deletedPlace.name}” for this session only — browser storage is unavailable`,\n                )\n                setDeletedPlace(undefined)",
)

const savedPlaces = `import { useCallback, useRef, useState } from 'react'\nimport type { Position } from '../brc/geo'\nimport { DATA_YEAR } from '../config'\n\nconst KEY_PREFIX = 'playa-map.places.v1'\nconst KEY = \`\${KEY_PREFIX}.\${DATA_YEAR}\`\nconst LEGACY_ARCHIVE_KEY = \`\${KEY_PREFIX}.legacy-unversioned\`\n\nfunction migrateLegacyUnversionedStorage(): void {\n  const legacy = localStorage.getItem(KEY_PREFIX)\n  if (legacy === null) return\n  if (localStorage.getItem(LEGACY_ARCHIVE_KEY) === null) localStorage.setItem(LEGACY_ARCHIVE_KEY, legacy)\n  localStorage.removeItem(KEY_PREFIX)\n}\n\nexport interface SavedPlace {\n  id: string\n  name: string\n  position: Position\n  address: string\n  savedAt: number\n}\n\nexport interface SavedPlaceResult {\n  place: SavedPlace\n  persisted: boolean\n}\n\nconst MAX_NAME_LENGTH = 200\n\nfunction isValidPlace(candidate: Partial<SavedPlace>): candidate is SavedPlace {\n  if (typeof candidate.id !== 'string' || candidate.id.trim().length === 0) return false\n  if (typeof candidate.name !== 'string' || candidate.name.trim().length === 0 || candidate.name.length > MAX_NAME_LENGTH) return false\n  if (typeof candidate.address !== 'string') return false\n  if (typeof candidate.savedAt !== 'number' || !Number.isFinite(candidate.savedAt)) return false\n  if (!Array.isArray(candidate.position) || candidate.position.length !== 2) return false\n  const [lng, lat] = candidate.position\n  if (typeof lng !== 'number' || !Number.isFinite(lng) || lng < -180 || lng > 180) return false\n  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) return false\n  return true\n}\n\nexport function parsePlaces(raw: string | null): SavedPlace[] {\n  if (!raw) return []\n  let parsed: unknown\n  try { parsed = JSON.parse(raw) } catch { return [] }\n  if (!Array.isArray(parsed)) return []\n  const seenIds = new Set<string>()\n  return parsed.filter((place): place is SavedPlace => {\n    if (typeof place !== 'object' || place === null) return false\n    const candidate = place as Partial<SavedPlace>\n    if (!isValidPlace(candidate) || seenIds.has(candidate.id)) return false\n    seenIds.add(candidate.id)\n    return true\n  })\n}\n\nfunction read(): SavedPlace[] {\n  try {\n    migrateLegacyUnversionedStorage()\n    return parsePlaces(localStorage.getItem(KEY))\n  } catch {\n    return []\n  }\n}\n\nfunction persist(places: SavedPlace[]): boolean {\n  try {\n    localStorage.setItem(KEY, JSON.stringify(places))\n    return true\n  } catch {\n    return false\n  }\n}\n\nexport function useSavedPlaces() {\n  const [places, setPlaces] = useState<SavedPlace[]>(read)\n  const placesRef = useRef(places)\n\n  const commit = useCallback((next: SavedPlace[]): boolean => {\n    const persisted = persist(next)\n    placesRef.current = next\n    setPlaces(next)\n    return persisted\n  }, [])\n\n  const save = useCallback((name: string, position: Position, address: string): SavedPlaceResult => {\n    const place: SavedPlace = {\n      id: \`\${Date.now().toString(36)}-\${Math.random().toString(36).slice(2, 7)}\`,\n      name,\n      position,\n      address,\n      savedAt: Date.now(),\n    }\n    const next = [place, ...placesRef.current]\n    return { place, persisted: commit(next) }\n  }, [commit])\n\n  const remove = useCallback((id: string): boolean => {\n    return commit(placesRef.current.filter((place) => place.id !== id))\n  }, [commit])\n\n  const restore = useCallback((place: SavedPlace): boolean => {\n    const next = placesRef.current.some((item) => item.id === place.id)\n      ? placesRef.current\n      : [place, ...placesRef.current]\n    return commit(next)\n  }, [commit])\n\n  const rename = useCallback((id: string, name: string): boolean => {\n    return commit(placesRef.current.map((place) => (place.id === id ? { ...place, name } : place)))\n  }, [commit])\n\n  return { places, save, remove, restore, rename }\n}\n`
await writeFile('src/data/useSavedPlaces.ts', savedPlaces)

const savedEvents = `import { useCallback, useRef, useState } from 'react'\nimport { DATA_YEAR } from '../config'\nimport type { EventItem } from './types'\n\nconst KEY = \`playa-map.saved-events.v1.\${DATA_YEAR}\`\n\nexport interface SavedEvent {\n  uid: string\n  title: string\n  savedAt: number\n}\n\nconst MAX_TITLE_LENGTH = 300\n\nfunction isValidSavedEvent(candidate: Partial<SavedEvent>): candidate is SavedEvent {\n  if (typeof candidate.uid !== 'string' || candidate.uid.trim().length === 0) return false\n  if (typeof candidate.title !== 'string' || candidate.title.trim().length === 0 || candidate.title.length > MAX_TITLE_LENGTH) return false\n  if (typeof candidate.savedAt !== 'number' || !Number.isFinite(candidate.savedAt)) return false\n  return true\n}\n\nexport function parseSavedEvents(raw: string | null): SavedEvent[] {\n  if (!raw) return []\n  let parsed: unknown\n  try { parsed = JSON.parse(raw) } catch { return [] }\n  if (!Array.isArray(parsed)) return []\n  const seenUids = new Set<string>()\n  return parsed.filter((entry): entry is SavedEvent => {\n    if (typeof entry !== 'object' || entry === null) return false\n    const candidate = entry as Partial<SavedEvent>\n    if (!isValidSavedEvent(candidate) || seenUids.has(candidate.uid)) return false\n    seenUids.add(candidate.uid)\n    return true\n  })\n}\n\nfunction read(): SavedEvent[] {\n  try { return parseSavedEvents(localStorage.getItem(KEY)) } catch { return [] }\n}\n\nfunction persist(events: SavedEvent[]): boolean {\n  try {\n    localStorage.setItem(KEY, JSON.stringify(events))\n    return true\n  } catch {\n    return false\n  }\n}\n\nexport function useSavedEvents() {\n  const [savedEvents, setSavedEvents] = useState<SavedEvent[]>(read)\n  const savedEventsRef = useRef(savedEvents)\n\n  const commit = useCallback((next: SavedEvent[]): boolean => {\n    const persisted = persist(next)\n    savedEventsRef.current = next\n    setSavedEvents(next)\n    return persisted\n  }, [])\n\n  const save = useCallback((event: EventItem): boolean => {\n    const next = savedEventsRef.current.some((item) => item.uid === event.uid)\n      ? savedEventsRef.current\n      : [{ uid: event.uid, title: event.title, savedAt: Date.now() }, ...savedEventsRef.current]\n    return commit(next)\n  }, [commit])\n\n  const remove = useCallback((uid: string): boolean => {\n    return commit(savedEventsRef.current.filter((item) => item.uid !== uid))\n  }, [commit])\n\n  const isSaved = useCallback(\n    (uid: string) => savedEvents.some((item) => item.uid === uid),\n    [savedEvents],\n  )\n\n  return { savedEvents, isSaved, save, remove }\n}\n`
await writeFile('src/data/useSavedEvents.ts', savedEvents)

await replace(
  'src/data/__tests__/savedPlacesHook.test.ts',
  "      saved = result.current.save(name, [-119.2, 40.78], 'D & 3:15')",
  "      saved = result.current.save(name, [-119.2, 40.78], 'D & 3:15').place",
)

const testPath = 'src/data/__tests__/savedPlacesHook.test.ts'
let tests = await readFile(testPath, 'utf8')
const persistenceTests = `\n\ndescribe('saved-place persistence failures (#106)', () => {\n  beforeEach(() => localStorage.clear())\n\n  it('reports a failed durable save while retaining the session copy', () => {\n    const { result } = renderHook(() => useSavedPlaces())\n    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {\n      throw new DOMException('quota', 'QuotaExceededError')\n    })\n    let outcome: ReturnType<typeof result.current.save> | undefined\n    act(() => {\n      outcome = result.current.save('Session tent', [-119.2, 40.78], 'D & 3:15')\n    })\n    expect(outcome?.persisted).toBe(false)\n    expect(result.current.places).toHaveLength(1)\n    setItem.mockRestore()\n  })\n\n  it('reports successful durable writes normally', () => {\n    const { result } = renderHook(() => useSavedPlaces())\n    let outcome: ReturnType<typeof result.current.save> | undefined\n    act(() => {\n      outcome = result.current.save('Durable tent', [-119.2, 40.78], 'D & 3:15')\n    })\n    expect(outcome?.persisted).toBe(true)\n    expect(localStorage.length).toBeGreaterThan(0)\n  })\n})\n`
if (!tests.includes("saved-place persistence failures (#106)")) {
  tests += persistenceTests
  await writeFile(testPath, tests)
}

await unlink('scripts/apply-issues-103-106.mjs')
await unlink('.github/workflows/apply-issues-103-106.yml')
