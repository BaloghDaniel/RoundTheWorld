import { supabase } from './supabase'

export type Place = {
  name: string
  region: string | null
  country: string | null
  label: string
  lon: number
  lat: number
}

export type GoalRoute = {
  route_id: string
  name: string
  distance_m: number
  mode: 'road' | 'ferry'
  reason: string | null
}

async function authHeader() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Not signed in')
  return { Authorization: `Bearer ${token}` }
}

const fn = (name: string) => `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`

/** Place search. Routed through the server so the routing key stays there. */
export async function searchPlaces(query: string): Promise<Place[]> {
  const res = await fetch(`${fn('geocode')}?q=${encodeURIComponent(query)}`, {
    headers: await authHeader(),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'Search failed')
  return body.results
}

/** Route between two places and store it. Land-first, like the world route. */
export async function createGoalRoute(from: Place, to: Place): Promise<GoalRoute> {
  const res = await fetch(fn('create-goal-route'), {
    method: 'POST',
    headers: { ...(await authHeader()), 'content-type': 'application/json' },
    body: JSON.stringify({
      from: { name: from.name, country: from.country, lon: from.lon, lat: from.lat },
      to: { name: to.name, country: to.country, lon: to.lon, lat: to.lat },
    }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'Could not build that route')
  return body
}

/** Begin a journey on a route that already exists. */
export async function startRouteJourney(routeId: string, from: string) {
  const { data, error } = await supabase.rpc('start_route_journey', {
    p_route_id: routeId,
    p_from: from,
  })
  if (error) throw error
  return data as string
}

/** Reverse geocode is not available, so a dropped pin is described by its
 *  coordinates until the user names it. */
export function placeFromCoords(lon: number, lat: number, name = 'My location'): Place {
  return { name, region: null, country: null, label: name, lon, lat }
}
