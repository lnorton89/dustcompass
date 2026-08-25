import fs from 'node:fs'

function replaceOnce(path, before, after) {
  const source = fs.readFileSync(path, 'utf8')
  if (!source.includes(before)) throw new Error(`${path}: patch anchor not found`)
  const next = source.replace(before, after)
  if (next === source) throw new Error(`${path}: patch produced no change`)
  fs.writeFileSync(path, next)
}

replaceOnce(
  'src/ui/NavBar.tsx',
  "        mx: { sm: 'auto' },\n      }}\n    >",
  "        mx: { sm: 'auto' },\n        // Foreground navigation chrome must stay above MapLibre markers and\n        // labels. FocusMarker deliberately has its own map-local z-index;\n        // without an app-level stack here its destination card can paint over\n        // the distance/heading strip on a phone (#129).\n        zIndex: (theme) => theme.zIndex.appBar + 1,\n      }}\n      data-testid=\"navigation-bar\"\n    >",
)

replaceOnce(
  'src/ui/DetailDrawer.tsx',
  "      open={Boolean(poi)}\n      onClose={onClose}\n      slotProps={{",
  "      open={Boolean(poi)}\n      onClose={onClose}\n      // When this temporary Drawer closes, MUI normally restores focus to the\n      // element that was focused before it opened. For a listing reached from\n      // Search that element is the search input, so pressing Take me there\n      // re-focused it and reopened the software keyboard over navigation.\n      // Navigation owns the next interaction instead; do not resurrect search\n      // focus as the sheet unmounts (#130).\n      ModalProps={{ disableRestoreFocus: true }}\n      slotProps={{",
)

console.log('mobile navigation patches applied')
