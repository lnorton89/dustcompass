import { readFile, writeFile, unlink } from 'node:fs/promises'

const path = 'src/App.tsx'
let source = await readFile(path, 'utf8')

function replaceOnce(pattern, replacement, label) {
  const next = source.replace(pattern, replacement)
  if (next === source) throw new Error(`App patch failed: ${label}`)
  source = next
}

replaceOnce(
  /  const releaseEventsLocation = useCallback\(\(\) => releaseLocation\('events'\), \[releaseLocation\]\)/,
  `  const releaseEventsLocation = useCallback(() => releaseLocation('events'), [releaseLocation])
  // A terminal denial clears the owner set. Navigation remains logically active,
  // so Retry must re-establish its claim instead of bypassing owner accounting.
  const retryNavigationLocation = useCallback(
    () => acquireLocation('navigation'),
    [acquireLocation],
  )`,
  'navigation retry callback',
)
replaceOnce(/onRetryLocation=\{location\.start\}/, 'onRetryLocation={retryNavigationLocation}', 'retry wiring')

replaceOnce(
  /onSave=\{\(name\) => \{\s+if \(saving\) savePlace\(name, saving\.position, saving\.address\)\s+setSaving\(undefined\)\s+setProbe\(`Saved "\$\{name\}"`\)\s+\/\/ Usually done while already moving away from the thing being marked\.\s+haptic\('confirm'\)\s+\}\}/,
  `onSave={(name) => {
          if (!saving) return
          const result = savePlace(name, saving.position, saving.address)
          setSaving(undefined)
          if (result.persisted) {
            setProbe(\`Saved "\${name}"\`)
            // Usually done while already moving away from the thing being marked.
            haptic('confirm')
          } else {
            setProbe(\`Saved "\${name}" for this session only — browser storage is unavailable\`)
          }
        }}`,
  'saved-place success copy',
)

replaceOnce(
  /removePlace\(id\)\s+setDeletedPlace\(place\)\s+setProbe\(`Removed “\$\{place\.name\}”`\)/,
  `const persisted = removePlace(id)
          setDeletedPlace(place)
          setProbe(
            persisted
              ? \`Removed “\${place.name}”\`
              : \`Removed “\${place.name}” for this session only — browser storage is unavailable\`,
          )`,
  'remove-place copy',
)

replaceOnce(
  /onToggleSaveEvent=\{\(event\) =>\s+isEventSaved\(event\.uid\) \? removeSavedEvent\(event\.uid\) : saveEvent\(event\)\s+\}/,
  `onToggleSaveEvent={(event) => {
            const persisted = isEventSaved(event.uid)
              ? removeSavedEvent(event.uid)
              : saveEvent(event)
            if (!persisted) {
              setProbe('Saved-event change is for this session only — browser storage is unavailable')
            }
          }}`,
  'events-panel persistence copy',
)

replaceOnce(
  /if \(isEventSaved\(selectedEvent\.uid\)\) removeSavedEvent\(selectedEvent\.uid\)\s+else saveEvent\(selectedEvent\)/,
  `const persisted = isEventSaved(selectedEvent.uid)
              ? removeSavedEvent(selectedEvent.uid)
              : saveEvent(selectedEvent)
            if (!persisted) {
              setProbe('Saved-event change is for this session only — browser storage is unavailable')
            }`,
  'event-detail persistence copy',
)

replaceOnce(
  /deletedPlace && probe === `Removed “\$\{deletedPlace\.name\}”`/,
  'deletedPlace && probe?.startsWith(`Removed “${deletedPlace.name}”`)',
  'undo visibility',
)

replaceOnce(
  /restorePlace\(deletedPlace\)\s+setProbe\(`Restored “\$\{deletedPlace\.name\}”`\)\s+setDeletedPlace\(undefined\)/,
  `const persisted = restorePlace(deletedPlace)
                setProbe(
                  persisted
                    ? \`Restored “\${deletedPlace.name}”\`
                    : \`Restored “\${deletedPlace.name}” for this session only — browser storage is unavailable\`,
                )
                setDeletedPlace(undefined)`,
  'restore-place copy',
)

await writeFile(path, source)
await unlink('scripts/apply-issues-103-106.mjs')
await unlink('scripts/patch-app-103-106.mjs')
await unlink('.github/workflows/apply-issues-103-106.yml')
