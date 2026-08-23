import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, relative } from 'node:path'

const root = join(process.cwd(), 'out')
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/$/, '')
const port = Number(process.env.PORT ?? process.argv[2] ?? 4173)

const types = {
  '.css': 'text/css; charset=utf-8',
  '.geojson': 'application/geo+json',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pbf': 'application/x-protobuf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost')
  let pathname = decodeURIComponent(url.pathname)
  if (basePath && pathname.startsWith(basePath)) pathname = pathname.slice(basePath.length) || '/'
  let file = normalize(join(root, pathname.replace(/^\/+/, '')))
  if (relative(root, file).startsWith('..')) {
    response.writeHead(403).end('Forbidden')
    return
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
  if (!existsSync(file) && !extname(file)) file = join(file, 'index.html')
  if (!existsSync(file)) {
    response.writeHead(404).end('Not found')
    return
  }
  response.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream')
  response.setHeader('Cache-Control', 'no-store')
  createReadStream(file).pipe(response)
}).listen(port, '127.0.0.1', () => {
  console.log(`Dust Compass export: http://127.0.0.1:${port}${basePath}/`)
})
