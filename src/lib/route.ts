export type Coord = [lon: number, lat: number]
export type SegmentMode = 'road' | 'ferry' | 'sea'

export type RouteSegment = {
  mode: SegmentMode
  reason: string | null
  distanceM: number
  cumStartM: number
  cumEndM: number
  coords: Coord[]
}

export type RouteAsset = {
  slug: string
  name: string
  totalDistanceM: number
  segments: RouteSegment[]
  landmarks: { name: string; country: string; cumM: number; at: Coord }[]
}

/** A drawable run of route, tagged so land and water can be styled apart. */
export type Piece = { mode: SegmentMode; coords: Coord[] }

/**
 * Break a line wherever it steps across the antimeridian.
 *
 * The route carries vertices exactly on the date line, so a Pacific crossing
 * contains a 180 -> -180 pair. That pair is zero distance on the globe but a
 * full sweep of the map in screen space, and drawing it unsplit sends a line
 * racing back across the whole world.
 */
export function splitAtSeam(coords: Coord[]): Coord[][] {
  const runs: Coord[][] = [[]]
  for (let i = 0; i < coords.length; i++) {
    if (i > 0 && Math.abs(coords[i][0] - coords[i - 1][0]) > 180) runs.push([])
    runs[runs.length - 1].push(coords[i])
  }
  return runs.filter((r) => r.length > 1)
}

let cached: Promise<RouteAsset> | null = null

/** The route is immutable, so one fetch per page load is plenty. */
export function loadRoute(): Promise<RouteAsset> {
  cached ??= fetch(`${import.meta.env.BASE_URL}routes/world.json`).then((res) => {
    if (!res.ok) throw new Error(`Could not load route (${res.status})`)
    return res.json() as Promise<RouteAsset>
  })
  return cached
}

const R = 6_371_008.8
const rad = (d: number) => (d * Math.PI) / 180

function haversine([lon1, lat1]: Coord, [lon2, lat2]: Coord) {
  const dLat = rad(lat2 - lat1)
  const dLon = rad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

const lerp = (a: Coord, b: Coord, t: number): Coord => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
]

/**
 * The stretch of route between two distances along it, one piece per segment.
 *
 * Walks vertices by true distance rather than taking a fraction of the line in
 * degree space, matching what route_point_at does server-side. Doing it the
 * other way put the drawn line hundreds of kilometres out.
 */
export function sliceBetween(route: RouteAsset, fromM: number, toM: number): Piece[] {
  if (toM <= fromM) return []
  const pieces: Piece[] = []

  for (const seg of route.segments) {
    if (seg.cumEndM <= fromM || seg.cumStartM >= toM) continue

    // Segment geometry is slightly shorter than the road distance it stands
    // for, so measure the target inside the geometry's own length.
    const spans = seg.coords.map((_, i) =>
      i === 0 ? 0 : haversine(seg.coords[i - 1], seg.coords[i]),
    )
    const geomLength = spans.reduce((a, b) => a + b, 0)
    if (geomLength === 0) continue

    const scale = geomLength / (seg.cumEndM - seg.cumStartM)
    const localFrom = Math.max(0, (fromM - seg.cumStartM) * scale)
    const localTo = Math.min(geomLength, (toM - seg.cumStartM) * scale)

    const coords: Coord[] = []
    let walked = 0
    for (let i = 0; i < seg.coords.length; i++) {
      const prevWalked = walked
      walked += spans[i]

      if (walked < localFrom) continue
      if (prevWalked > localTo) break

      // Cut the first and last vertices to the exact requested distance so the
      // line starts and ends where the marker does.
      if (prevWalked < localFrom && spans[i] > 0) {
        coords.push(lerp(seg.coords[i - 1], seg.coords[i], (localFrom - prevWalked) / spans[i]))
      }
      if (walked > localTo && spans[i] > 0) {
        coords.push(lerp(seg.coords[i - 1], seg.coords[i], (localTo - prevWalked) / spans[i]))
        break
      }
      coords.push(seg.coords[i])
    }

    if (coords.length > 1) pieces.push({ mode: seg.mode, coords })
  }

  return pieces
}

/**
 * The covered part of a journey.
 *
 * A journey that has wrapped past the route's end comes back as two runs —
 * start-to-end and beginning-to-here — because a single line would draw a
 * false shortcut straight back across the map.
 */
export function coveredPortions(
  route: RouteAsset,
  startOffsetM: number,
  travelledM: number,
): Piece[] {
  if (travelledM >= route.totalDistanceM) {
    return sliceBetween(route, 0, route.totalDistanceM)
  }

  const end = startOffsetM + travelledM
  if (end <= route.totalDistanceM) {
    return sliceBetween(route, startOffsetM, end)
  }
  return [
    ...sliceBetween(route, startOffsetM, route.totalDistanceM),
    ...sliceBetween(route, 0, end - route.totalDistanceM),
  ]
}
