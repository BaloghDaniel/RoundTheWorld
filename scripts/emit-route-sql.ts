// Turns data/routes/world.json into SQL for seeding Supabase.
//
//   node scripts/emit-route-sql.ts
//
// Output goes to data/routes/sql/ as numbered chunks, because a whole-world
// route is a few megabytes of WKT and applying it as one statement is
// unwieldy. Each chunk is independently re-runnable.

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { toWkt, type Coord } from './lib/geo.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MAX_CHUNK_BYTES = 400_000

type Segment = {
  seq: number
  name: string
  mode: 'road' | 'ferry' | 'sea'
  reason: string | null
  distanceM: number
  cumStartM: number
  cumEndM: number
  coords: Coord[]
}

const quote = (s: string | null) => (s === null ? 'null' : `'${s.replaceAll("'", "''")}'`)

const route = JSON.parse(
  await readFile(join(ROOT, 'data/routes/world.json'), 'utf8'),
) as {
  slug: string
  name: string
  totalDistanceM: number
  segments: Segment[]
  landmarks: { name: string; country: string; cumM: number; at: Coord }[]
}

const statements: string[] = []

// The whole-route line is only used for a quick overview draw; the segments
// carry the detail. Built by stitching segment geometry in order.
const whole: Coord[] = []
for (const s of route.segments) {
  for (const c of s.coords) {
    const last = whole.at(-1)
    if (!last || last[0] !== c[0] || last[1] !== c[1]) whole.push(c)
  }
}

statements.push(`delete from public.routes where slug = ${quote(route.slug)};`)
statements.push(
  `insert into public.routes (slug, name, kind, allows_sea, total_distance_m, geom)
values (${quote(route.slug)}, ${quote(route.name)}, 'world', true,
        ${route.totalDistanceM}, '${toWkt(whole)}');`,
)

for (const s of route.segments) {
  statements.push(
    `insert into public.route_segments
       (route_id, seq, mode, reason, distance_m, cum_start_m, cum_end_m, geom)
     select id, ${s.seq}, ${quote(s.mode)}, ${quote(s.reason)},
            ${s.distanceM}, ${s.cumStartM}, ${s.cumEndM}, '${toWkt(s.coords)}'
     from public.routes where slug = ${quote(route.slug)};`,
  )
}

for (const l of route.landmarks) {
  statements.push(
    `insert into public.route_landmarks (route_id, name, country, cum_m, geom)
     select id, ${quote(l.name)}, ${quote(l.country)}, ${l.cumM},
            'SRID=4326;POINT(${l.at[0].toFixed(5)} ${l.at[1].toFixed(5)})'
     from public.routes where slug = ${quote(route.slug)};`,
  )
}

// Pack statements into chunks that stay under the size limit.
const outDir = join(ROOT, 'data/routes/sql')
await rm(outDir, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })

let chunk: string[] = []
let bytes = 0
let index = 0

async function flush() {
  if (chunk.length === 0) return
  const file = join(outDir, `${String(index).padStart(3, '0')}.sql`)
  await writeFile(file, chunk.join('\n\n') + '\n')
  console.log(`${file}  ${chunk.length} statement(s), ${(bytes / 1024).toFixed(0)} KB`)
  index++
  chunk = []
  bytes = 0
}

for (const s of statements) {
  if (bytes + s.length > MAX_CHUNK_BYTES) await flush()
  chunk.push(s)
  bytes += s.length
}
await flush()

console.log(`\n${route.segments.length} segments, ${route.landmarks.length} landmarks`)
console.log(`whole-route line: ${whole.length.toLocaleString()} points`)
console.log(`total: ${(route.totalDistanceM / 1000).toFixed(0)} km`)
