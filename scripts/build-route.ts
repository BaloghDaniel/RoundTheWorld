// Generates the world route and writes it to data/routes/world.json.
//
//   node --env-file=.env.local scripts/build-route.ts
//
// This is a one-off. The output is committed, seeded into Supabase once, and
// the app never calls a routing API at runtime.
//
// The land-first rule is enforced here: every stage is first requested with
// ferries forbidden. Only when that fails do we allow a ferry, and only when
// routing fails outright do we draw a sea arc — always with a stated reason.

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { greatCircle, lineLength, simplify, type Coord } from './lib/geo.ts'
import { NoRouteError, route } from './lib/ors.ts'
import { WORLD_ROUTE, type Waypoint } from './world-route.ts'

const SIMPLIFY_TOLERANCE_M = 200
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

type Segment = {
  seq: number
  name: string
  mode: 'road' | 'ferry' | 'sea'
  reason: string | null
  distanceM: number
  coords: Coord[]
}

const log = (msg: string) => console.log(msg)

/** Land first, ferry if we must, sea arc only as a last resort. */
async function buildStage(
  name: string,
  waypoints: Waypoint[],
): Promise<{ coords: Coord[]; distanceM: number; mode: 'road' | 'ferry'; reason: string | null }> {
  const coords = waypoints.map((w) => w.at)

  try {
    const result = await route(coords, true)
    log(`  ✓ ${name}: ${(result.distanceM / 1000).toFixed(0)} km, land only`)
    return { ...result, mode: 'road', reason: null }
  } catch (err) {
    if (!(err instanceof NoRouteError)) throw err
  }

  // No land-only route. Allow ferries and see whether the leg exists at all.
  const result = await route(coords, false)
  const reason = 'No land-only route exists here; this leg requires a ferry.'
  log(`  ⚓ ${name}: ${(result.distanceM / 1000).toFixed(0)} km, ferry required`)
  return { ...result, mode: 'ferry', reason }
}

async function main() {
  const segments: Segment[] = []
  const landmarks: { name: string; country: string; cumM: number; at: Coord }[] = []
  let cum = 0
  let seq = 0

  for (const item of WORLD_ROUTE) {
    if (item.kind === 'stage') {
      log(`Routing ${item.name}…`)
      const { coords, distanceM, mode, reason } = await buildStage(item.name, item.waypoints)
      const thinned = simplify(coords, SIMPLIFY_TOLERANCE_M)

      segments.push({ seq: seq++, name: item.name, mode, reason, distanceM, coords: thinned })

      // Pin each landmark to its distance along the route by measuring to the
      // nearest point on the thinned geometry.
      for (const w of item.waypoints.filter((w) => w.landmark)) {
        const idx = nearestIndex(thinned, w.at)
        landmarks.push({
          name: w.name,
          country: w.country,
          cumM: cum + (lineLength(thinned.slice(0, idx + 1)) / lineLength(thinned)) * distanceM,
          at: thinned[idx],
        })
      }

      cum += distanceM
      continue
    }

    // A declared crossing. Check the claim before believing it.
    const label = `${item.from.name} → ${item.to.name}`
    log(`Checking declared crossing ${label}…`)

    try {
      const result = await route([item.from.at, item.to.at], false)
      // The declaration was wrong: a road (possibly with ferries) exists.
      log(`  ! ${label} is drivable after all — using the road, not a sea arc`)
      const thinned = simplify(result.coords, SIMPLIFY_TOLERANCE_M)
      segments.push({
        seq: seq++,
        name: label,
        mode: 'ferry',
        reason: 'Routable, but not by land alone.',
        distanceM: result.distanceM,
        coords: thinned,
      })
      cum += result.distanceM
    } catch (err) {
      if (!(err instanceof NoRouteError)) throw err

      const coords = greatCircle(item.from.at, item.to.at)
      const distanceM = lineLength(coords)
      log(`  ~ ${label}: ${(distanceM / 1000).toFixed(0)} km sea crossing — confirmed no road`)
      segments.push({
        seq: seq++,
        name: label,
        mode: 'sea',
        reason: item.reason,
        distanceM,
        coords,
      })
      landmarks.push({
        name: item.to.name,
        country: item.to.country,
        cumM: cum + distanceM,
        at: item.to.at,
      })
      cum += distanceM
    }
  }

  // Stamp cumulative distances now that the whole route is known.
  let running = 0
  const withCum = segments.map((s) => {
    const entry = { ...s, cumStartM: running, cumEndM: running + s.distanceM }
    running += s.distanceM
    return entry
  })

  const output = {
    slug: 'world',
    name: 'Around the World',
    generatedAt: new Date().toISOString(),
    totalDistanceM: running,
    simplifyToleranceM: SIMPLIFY_TOLERANCE_M,
    segments: withCum,
    landmarks,
  }

  const out = join(ROOT, 'data/routes/world.json')
  await mkdir(dirname(out), { recursive: true })
  await writeFile(out, JSON.stringify(output))

  const points = withCum.reduce((n, s) => n + s.coords.length, 0)
  const sea = withCum.filter((s) => s.mode !== 'road')
  log('')
  log(`Total: ${(running / 1000).toFixed(0)} km across ${withCum.length} segments`)
  log(`Geometry: ${points.toLocaleString()} points after simplification`)
  log(`Not on land: ${sea.length} segment(s)`)
  for (const s of sea) log(`  ${s.mode}: ${s.name} — ${s.reason}`)
  log(`Written to ${out}`)
}

function nearestIndex(coords: Coord[], target: Coord) {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < coords.length; i++) {
    const d = (coords[i][0] - target[0]) ** 2 + (coords[i][1] - target[1]) ** 2
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  }
  return best
}

await main()
