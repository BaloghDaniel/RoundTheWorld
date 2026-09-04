import type { Coord } from './geo.ts'

const ENDPOINT = 'https://api.openrouteservice.org/v2/directions'

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

export class NoRouteError extends Error {}

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
  const res = await fetch(`${ENDPOINT}/${PROFILE}/geojson`, {
    method: 'POST',
    headers: {
      authorization: apiKey(),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      coordinates: waypoints,
      // Let ORS thin the geometry server-side before it crosses the wire.
      geometry_simplify: true,
      instructions: false,
      ...(avoidFerries ? { options: { avoid_features: ['ferries'] } } : {}),
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    // 404 with error code 2009/2010 is ORS for "no route found between these
    // points", which for our purposes is a fact about the world, not a fault.
    if (res.status === 404) throw new NoRouteError(body)
    if (res.status === 429) throw new Error(`ORS quota exhausted: ${body}`)
    throw new Error(`ORS ${res.status}: ${body}`)
  }

  const geojson = await res.json()
  const feature = geojson.features?.[0]
  if (!feature) throw new NoRouteError('ORS returned no features')

  return {
    coords: feature.geometry.coordinates as Coord[],
    distanceM: feature.properties.summary.distance as number,
  }
}
