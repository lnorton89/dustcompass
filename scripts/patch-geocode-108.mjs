import { readFile, writeFile } from 'node:fs/promises'
const path = 'src/brc/geocode.ts'
let source = await readFile(path, 'utf8')
const broken = `  // The trailing guard matters: without it the hour of a second clock reads\n  // as a distance, and "10:00 & 10:00 B Plaza" pins ten feet from the Man\n  // instead of on a plaza a kilometre away.\n  , 'i').exec(raw)`
const fixed = `  // The trailing guard matters: without it the hour of a second clock reads\n  // as a distance, and "10:00 & 10:00 B Plaza" pins ten feet from the Man\n  // instead of on a plaza a kilometre away.\n  const open = new RegExp(String.raw\`^(\${CLOCK})\\\\s*[,&@]?\\\\s*(\\\\d{1,5})(?![\\\\d:.])\\\\s*(?:'|ft|feet)?\\\\s*$\`, 'i').exec(raw)`
if (!source.includes(broken)) throw new Error('corrupted open-playa parser not found')
source = source.replace(broken, fixed)
await writeFile(path, source)
