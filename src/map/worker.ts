import { setWorkerUrl } from 'maplibre-gl'
import { assetUrl } from '../config'

// Next cannot preserve MapLibre's sibling-worker URL once the package is
// bundled into hashed static chunks. Serve the official module worker from the
// same project base path instead; this also works under a strict CSP.
setWorkerUrl(assetUrl('maplibre-worker.mjs'))
