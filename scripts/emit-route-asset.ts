// Writes the route as a static asset for the PWA to draw.
//
//   node scripts/emit-route-asset.ts
//
// Geometry is served from GitHub Pages rather than the database: it is public,
// immutable reference data, so the CDN and the service worker can cache it and
// the app needs no query to render the map. The database keeps the
// authoritative copy for position maths.

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Coord } from './lib/geo.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// Five decimal places is ~1 m. Full float precision triples the file size to
// describe a road to the nearest nanometre.
const round = ([lon, lat]: Coord): Coord => [+lon.toFixed(5), +lat.toFixed(5)]

const route = JSON.parse(await readFile(join(ROOT, 'data/routes/world.json'), 'utf8'))

const asset = {
  slug: route.slug,
  name: route.name,
  totalDistanceM: route.totalDistanceM,
  segments: route.segments.map(
    (s: {
      mode: string
      reason: string | null
      distanceM: number
      cumStartM: number
      cumEndM: number
      coords: Coord[]
    }) => ({
      mode: s.mode,
      reason: s.reason,
      distanceM: s.distanceM,
      cumStartM: s.cumStartM,
      cumEndM: s.cumEndM,
      coords: s.coords.map(round),
    }),
  ),
  landmarks: route.landmarks.map(
    (l: { name: string; country: string; cumM: number; at: Coord }) => ({
      name: l.name,
      country: l.country,
      cumM: Math.round(l.cumM),
      at: round(l.at),
    }),
  ),
}

const out = join(ROOT, 'public/routes/world.json')
await mkdir(dirname(out), { recursive: true })
await writeFile(out, JSON.stringify(asset))

const { size } = await stat(out)
console.log(`${out}  ${(size / 1024).toFixed(0)} KB`)
console.log(`${asset.segments.length} segments, ${asset.landmarks.length} landmarks`)
