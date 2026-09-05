import type { Coord } from './geo.ts'

const ENDPOINT = 'https://api.openrouteservice.org'

// driving-car for the same reason the world route uses it: the driving network
// is continuous wherever a road exists, while cycling and foot profiles fail
// or detour badly over long distances.
const PROFILE = 'driving-car'
const SNAP_RADIUS_M = 20_000

export class NoRouteError extends Error {}
export class TooFarError extends Error {}

export function orsKey() {
  const key = Deno.env.get('ORS_API_KEY')
  if (!key) throw new Error('ORS_API_KEY is not set on the server')
  return key
}

export async function directions(waypoints: Coord[], avoidFerries: boolean) {
  const res = await fetch(`${ENDPOINT}/v2/directions/${PROFILE}/geojson`, {
    method: 'POST',
    headers: { authorization: orsKey(), 'content-type': 'application/json' },
    body: JSON.stringify({
      coordinates: waypoints,
      radiuses: waypoints.map(() => SNAP_RADIUS_M),
      geometry_simplify: true,
      instructions: false,
      ...(avoidFerries ? { options: { avoid_features: ['ferries'] } } : {}),
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    let code: number | undefined
    try {
      code = JSON.parse(body)?.error?.code
    } catch {
      // Non-JSON error body; fall through.
    }
    // 2009 means no route exists; 2010 means a point is not near a road; 2004
    // means the request is longer than ORS will attempt. They are different
    // facts and the caller needs to tell them apart.
    if (code === 2009 || res.status === 404) throw new NoRouteError(body)
    if (code === 2004) throw new TooFarError(body)
    throw new Error(`ORS ${res.status}: ${body}`)
  }

  const geojson = await res.json()
  const feature = geojson.features?.[0]
  if (!feature) throw new NoRouteError('ORS returned no route')
  return {
    coords: feature.geometry.coordinates as Coord[],
    distanceM: feature.properties.summary.distance as number,
  }
}

export async function geocode(text: string, size = 6) {
  const url = new URL(`${ENDPOINT}/geocode/autocomplete`)
  url.searchParams.set('text', text)
  url.searchParams.set('size', String(size))
  url.searchParams.set('layers', 'locality,localadmin,region,country')

  const res = await fetch(url, { headers: { authorization: orsKey() } })
  if (!res.ok) throw new Error(`ORS geocode ${res.status}: ${await res.text()}`)

  const data = await res.json()
  return (data.features ?? []).map((f: {
    properties: { name?: string; region?: string; country?: string; label?: string }
    geometry: { coordinates: Coord }
  }) => ({
    name: f.properties.name ?? f.properties.label ?? 'Unknown',
    region: f.properties.region ?? null,
    country: f.properties.country ?? null,
    label: f.properties.label ?? f.properties.name ?? '',
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
  }))
}
