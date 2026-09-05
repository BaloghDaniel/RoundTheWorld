// Builds a city-to-city goal route and stores it for the calling user.
//
// Same land-first rule as the world route: ask for a route that refuses to
// board a boat, and only allow a ferry when no land route exists. Unlike the
// world route there is no sea-arc fallback -- if two places are not connected
// by road at all, saying so is more useful than inventing a crossing.

import { adminClient, callerId, corsHeaders, json } from '../_shared/http.ts'
import { insertSeamVertices, simplify, toWkt, type Coord } from '../_shared/geo.ts'
import { directions, NoRouteError, TooFarError } from '../_shared/ors.ts'

const SIMPLIFY_TOLERANCE_M = 100

type Place = { name: string; country?: string | null; lon: number; lat: number }

function validPlace(p: unknown): p is Place {
  const q = p as Place
  return (
    !!q && typeof q.name === 'string' &&
    Number.isFinite(q.lon) && Math.abs(q.lon) <= 180 &&
    Number.isFinite(q.lat) && Math.abs(q.lat) <= 90
  )
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const userId = await callerId(req)
  if (!userId) return json({ error: 'Not signed in' }, 401)

  let from: Place, to: Place
  try {
    const body = await req.json()
    if (!validPlace(body.from) || !validPlace(body.to)) throw new Error('bad places')
    from = body.from
    to = body.to
  } catch {
    return json({ error: 'Expected { from, to } with name, lon and lat' }, 400)
  }

  const waypoints: Coord[] = [[from.lon, from.lat], [to.lon, to.lat]]

  let result: { coords: Coord[]; distanceM: number }
  let mode: 'road' | 'ferry' = 'road'
  let reason: string | null = null

  try {
    result = await directions(waypoints, true)
  } catch (err) {
    if (err instanceof TooFarError) {
      return json(
        { error: 'That route is longer than the routing service will calculate (6,000 km). Try closer places.' },
        422,
      )
    }
    if (!(err instanceof NoRouteError)) {
      return json({ error: err instanceof Error ? err.message : 'Routing failed' }, 502)
    }
    // No land-only route. Allow a ferry before giving up.
    try {
      result = await directions(waypoints, false)
      mode = 'ferry'
      reason = 'No land-only route exists here; this journey requires a ferry.'
    } catch (inner) {
      if (inner instanceof NoRouteError) {
        return json(
          { error: `No road route exists between ${from.name} and ${to.name}.` },
          422,
        )
      }
      return json({ error: inner instanceof Error ? inner.message : 'Routing failed' }, 502)
    }
  }

  const coords = insertSeamVertices(simplify(result.coords, SIMPLIFY_TOLERANCE_M))
  const db = adminClient()
  const name = `${from.name} → ${to.name}`

  const { data: route, error: routeError } = await db
    .from('routes')
    .insert({
      // Unique per user and per attempt, so repeated goals never collide.
      slug: `goal-${userId.slice(0, 8)}-${Date.now().toString(36)}`,
      name,
      kind: 'custom',
      is_loop: false,
      allows_sea: mode !== 'road',
      origin_name: from.name,
      destination_name: to.name,
      total_distance_m: result.distanceM,
      geom: toWkt(coords),
      owner_id: userId,
    })
    .select('id')
    .single()

  if (routeError) return json({ error: routeError.message }, 500)

  const { error: segError } = await db.from('route_segments').insert({
    route_id: route.id,
    seq: 0,
    mode,
    reason,
    distance_m: result.distanceM,
    cum_start_m: 0,
    cum_end_m: result.distanceM,
    geom: toWkt(coords),
  })
  if (segError) return json({ error: segError.message }, 500)

  // The endpoints double as the journey's milestones, so the UI has something
  // to name as passed and next.
  const { error: lmError } = await db.from('route_landmarks').insert([
    { route_id: route.id, name: from.name, country: from.country ?? null, cum_m: 0,
      geom: `SRID=4326;POINT(${from.lon.toFixed(5)} ${from.lat.toFixed(5)})` },
    { route_id: route.id, name: to.name, country: to.country ?? null, cum_m: result.distanceM,
      geom: `SRID=4326;POINT(${to.lon.toFixed(5)} ${to.lat.toFixed(5)})` },
  ])
  if (lmError) return json({ error: lmError.message }, 500)

  return json({
    route_id: route.id,
    name,
    distance_m: result.distanceM,
    mode,
    reason,
  })
})
