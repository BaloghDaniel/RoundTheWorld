// Seeds data/routes/world.json into Supabase.
//
//   node --env-file=.env.local scripts/seed-route.ts
//
// Needs a secret key, because route tables are readable by signed-in users but
// writable only by the service role. Run once; it is idempotent, replacing any
// existing route with the same slug.
//
// Supabase's modern secret keys (sb_secret_…) and the legacy service_role JWT
// both resolve to the same BYPASSRLS role, so either works.

import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { toWkt, type Coord } from './lib/geo.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SEGMENT_BATCH = 3

const url = process.env.VITE_SUPABASE_URL
const serviceKey =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  throw new Error(
    'VITE_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local. ' +
      'Create a secret key in Supabase → Settings → API Keys. ' +
      '(SUPABASE_SERVICE_ROLE_KEY is accepted too, for the legacy key.)',
  )
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } })

type Segment = {
  seq: number
  mode: 'road' | 'ferry' | 'sea'
  reason: string | null
  distanceM: number
  cumStartM: number
  cumEndM: number
  coords: Coord[]
}

const route = JSON.parse(await readFile(join(ROOT, 'data/routes/world.json'), 'utf8')) as {
  slug: string
  name: string
  totalDistanceM: number
  segments: Segment[]
  landmarks: { name: string; country: string; cumM: number; at: Coord }[]
}

function fail(step: string, error: { message: string } | null) {
  if (error) throw new Error(`${step}: ${error.message}`)
}

// One stitched line for drawing the whole route at a glance.
const whole: Coord[] = []
for (const s of route.segments) {
  for (const c of s.coords) {
    const last = whole.at(-1)
    if (!last || last[0] !== c[0] || last[1] !== c[1]) whole.push(c)
  }
}

// Update in place rather than replace. Journeys reference the route and store
// their start as a distance along it, so deleting and re-inserting would either
// be refused by the foreign key or silently move everyone who had started.
const { data: existing } = await db
  .from('routes')
  .select('id, total_distance_m')
  .eq('slug', route.slug)
  .maybeSingle()

let routeId: string

if (existing) {
  const drift = Math.abs(existing.total_distance_m - route.totalDistanceM)
  if (drift > 1000) {
    console.warn(
      `! total distance moved by ${(drift / 1000).toFixed(1)} km. Existing ` +
        `journeys keep their start_offset_m, so their position will shift.`,
    )
  }

  fail(
    'update route',
    (
      await db
        .from('routes')
        .update({
          name: route.name,
          total_distance_m: route.totalDistanceM,
          geom: toWkt(whole),
        })
        .eq('id', existing.id)
    ).error,
  )

  fail('clear segments', (await db.from('route_segments').delete().eq('route_id', existing.id)).error)
  fail('clear landmarks', (await db.from('route_landmarks').delete().eq('route_id', existing.id)).error)
  routeId = existing.id
  console.log(`route ${route.slug} → ${routeId} (updated in place)`)
} else {
  const { data: inserted, error: routeError } = await db
    .from('routes')
    .insert({
      slug: route.slug,
      name: route.name,
      kind: 'world',
      allows_sea: true,
      total_distance_m: route.totalDistanceM,
      geom: toWkt(whole),
    })
    .select('id')
    .single()
  fail('insert route', routeError)
  routeId = inserted!.id
  console.log(`route ${route.slug} → ${routeId} (created)`)
}

console.log(`  ${whole.length.toLocaleString()} points on the overview line`)

for (let i = 0; i < route.segments.length; i += SEGMENT_BATCH) {
  const batch = route.segments.slice(i, i + SEGMENT_BATCH).map((s) => ({
    route_id: routeId,
    seq: s.seq,
    mode: s.mode,
    reason: s.reason,
    distance_m: s.distanceM,
    cum_start_m: s.cumStartM,
    cum_end_m: s.cumEndM,
    geom: toWkt(s.coords),
  }))
  fail(`insert segments ${i}…`, (await db.from('route_segments').insert(batch)).error)
  console.log(`  segments ${i}–${i + batch.length - 1}`)
}

fail(
  'insert landmarks',
  (
    await db.from('route_landmarks').insert(
      route.landmarks.map((l) => ({
        route_id: routeId,
        name: l.name,
        country: l.country,
        cum_m: l.cumM,
        geom: `SRID=4326;POINT(${l.at[0].toFixed(5)} ${l.at[1].toFixed(5)})`,
      })),
    )
  ).error,
)

console.log(`  ${route.landmarks.length} landmarks`)
console.log(`done: ${(route.totalDistanceM / 1000).toFixed(0)} km`)
