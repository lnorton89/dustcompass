import { copyFile } from 'node:fs/promises'
import { join } from 'node:path'

const distribution = join(process.cwd(), 'node_modules', 'maplibre-gl', 'dist')

await Promise.all([
  copyFile(join(distribution, 'maplibre-gl-worker.mjs'), join(process.cwd(), 'public', 'maplibre-worker.mjs')),
  copyFile(join(distribution, 'maplibre-gl-shared.mjs'), join(process.cwd(), 'public', 'maplibre-gl-shared.mjs')),
])
console.log('Prepared the MapLibre module worker and shared runtime for the static export.')
