import { readFile, writeFile } from 'node:fs/promises'
const path = 'src/ui/ArtAudioGuide.tsx'
const before = await readFile(path, 'utf8')
const from = '  const audioUrlRef = useRef<string>()'
const to = '  const audioUrlRef = useRef<string | undefined>(undefined)'
if (!before.includes(from)) throw new Error('audio URL ref declaration not found')
await writeFile(path, before.replace(from, to))
