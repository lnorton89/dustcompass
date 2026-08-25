import fs from 'node:fs'
const path = 'src/App.tsx'
let source = fs.readFileSync(path, 'utf8')
const before = "  const startDirections = useCallback(() => {"
const after = "  const framedNavigationFor = useRef<string | undefined>(undefined)\n\n  const startDirections = useCallback(() => {"
if (!source.includes(before)) throw new Error('startDirections pattern missing')
source = source.replace(before, after)
const duplicate = "\n  const framedNavigationFor = useRef<string | undefined>(undefined)\n  const navigateTo = useCallback("
if (!source.includes(duplicate)) throw new Error('later framedNavigationFor pattern missing')
source = source.replace(duplicate, "\n  const navigateTo = useCallback(")
fs.writeFileSync(path, source)
fs.rmSync('scripts/fix-directions-ref-order.mjs')
