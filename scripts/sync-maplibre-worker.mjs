// Copy MapLibre's web worker into public/ so it is served alongside the app.
//
// MapLibre resolves its worker as `new URL('./' + name, import.meta.url)` with
// the filename built at runtime. Vite cannot analyse that statically, so it
// never emits the worker as an asset and the URL 404s. The failure is silent:
// the style and sprites load on the main thread, but vector tiles are parsed
// in the worker, so the source never finishes loading and the map stays blank.
//
// Runs from `prebuild`, so the copy cannot drift from the installed version.

import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FROM = join(ROOT, 'node_modules/maplibre-gl/dist')
const TO = join(ROOT, 'public/maplibre')

// The worker imports the shared chunk relatively, so both must sit together.
const FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']

await mkdir(TO, { recursive: true })
for (const name of FILES) {
  await copyFile(join(FROM, name), join(TO, name))
  console.log(`maplibre worker → public/maplibre/${name}`)
}
