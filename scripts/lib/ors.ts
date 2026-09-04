import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Coord } from './geo.ts'

const ENDPOINT = 'https://api.openrouteservice.org/v2/directions'

// Responses are cached on disk so that fixing one bad waypoint does not mean
// re-requesting the stages that already succeeded. The cache is gitignored:
// it is a convenience for iterating, not part of the build output.
const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../.ors-cache')

// driving-car rather than a cycling or foot profile. Those profiles routinely
// fail or take bizarre detours over intercontinental distances, whereas the
// driving network is continuous everywhere a road exists. The route is meant
// to be a real road you could travel, not a bike-legal one.
const PROFILE = 'driving-car'

// ORS rejects a single request over 6,000 km or 50 waypoints.
export const MAX_LEG_DISTANCE_M = 6_000_000
export const MAX_WAYPOINTS = 50

export type RouteResult = {
  coords: Coord[]
  distanceM: number
}

/** ORS 2009: the points are fine, but no route connects them. A fact about
 *  the world, and the signal our land-first cascade is looking for. */
export class NoRouteError extends Error {}

/** ORS 2010: a waypoint is not near any road. That is a bad coordinate on our
 *  side, not a missing connection, and must never be mistaken for one. */
export class UnroutablePointError extends Error {}

/** ORS 2004: the request is longer than the server will attempt. We learn
 *  nothing about whether a road exists — only that ORS declined to look. */
export class TooFarError extends Error {}

// City centroids can land in a park, a reservoir or a pedestrian zone. Let ORS
// snap to a road within this radius instead of demanding hand-tuned
// coordinates for sixty cities.
const SNAP_RADIUS_M = 20_000

function apiKey() {
  const key = process.env.ORS_API_KEY
  if (!key) {
    throw new Error(
      'ORS_API_KEY is not set. Add it to .env.local — see README, "Route data".',
    )
  }
  return key
}

/**
 * One ORS request through the given waypoints.
 *
 * `avoidFerries` is the whole point of this module: we ask for a route that
 * refuses to board a boat, and treat failure as evidence that no land route
 * exists between those points.
 */
export async function route(
  waypoints: Coord[],
  avoidFerries: boolean,
): Promise<RouteResult> {
  const payload = JSON.stringify({
    coordinates: waypoints,
    radiuses: waypoints.map(() => SNAP_RADIUS_M),
    // Let ORS thin the geometry server-side before it crosses the wire.
    geometry_simplify: true,
    instructions: false,
    ...(avoidFerries ? { options: { avoid_features: ['ferries'] } } : {}),
  })

  // Cache both outcomes. A leg that has no land route is a stable fact, and
  // re-asking on every run wastes a request to learn it again.
  const cacheFile = join(
    CACHE_DIR,
    `${createHash('sha256').update(`${PROFILE}:${payload}`).digest('hex').slice(0, 32)}.json`,
  )
  try {
    const cached = JSON.parse(await readFile(cacheFile, 'utf8'))
    if (cached.noRoute) throw new NoRouteError('cached: no route')
    if (cached.tooFar) throw new TooFarError('cached: beyond routable range')
    return cached as RouteResult
  } catch (err) {
    if (err instanceof NoRouteError || err instanceof TooFarError) throw err
    // Cache miss; fall through to the network.
  }

  const res = await fetch(`${ENDPOINT}/${PROFILE}/geojson`, {
    method: 'POST',
    headers: {
      authorization: apiKey(),
      'content-type': 'application/json',
    },
    body: payload,
  })

  async function remember(value: unknown) {
    await mkdir(CACHE_DIR, { recursive: true })
    await writeFile(cacheFile, JSON.stringify(value))
  }

  if (!res.ok) {
    const body = await res.text()
    if (res.status === 429) throw new Error(`ORS quota exhausted: ${body}`)

    // Distinguishing 2009 from 2010 matters: one means "there is no way
    // across", the other means "your coordinate is in a lake". Treating the
    // second as the first would invent a sea crossing out of a typo.
    let code: number | undefined
    try {
      code = JSON.parse(body)?.error?.code
    } catch {
      // Non-JSON error body; fall through to the generic cases below.
    }

    // A bad coordinate is not cached: it is a bug to fix, not a stable fact.
    if (code === 2010) throw new UnroutablePointError(body)
    if (code === 2004) {
      await remember({ tooFar: true })
      throw new TooFarError(body)
    }
    if (code === 2009 || res.status === 404) {
      await remember({ noRoute: true })
      throw new NoRouteError(body)
    }
    throw new Error(`ORS ${res.status}: ${body}`)
  }

  const geojson = await res.json()
  const feature = geojson.features?.[0]
  if (!feature) throw new NoRouteError('ORS returned no features')

  const result: RouteResult = {
    coords: feature.geometry.coordinates as Coord[],
    distanceM: feature.properties.summary.distance as number,
  }
  await remember(result)
  return result
}
