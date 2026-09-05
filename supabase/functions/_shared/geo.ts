export type Coord = [lon: number, lat: number]

const R = 6_371_008.8
const rad = (d: number) => (d * Math.PI) / 180

export function haversine([lon1, lat1]: Coord, [lon2, lat2]: Coord) {
  const dLat = rad(lat2 - lat1)
  const dLon = rad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/**
 * Ramer-Douglas-Peucker with the tolerance in metres.
 *
 * Iterative rather than recursive: a long route has enough vertices to blow
 * the stack. Mirrors scripts/lib/geo.ts, which thins the world route.
 */
export function simplify(coords: Coord[], toleranceM: number): Coord[] {
  if (coords.length < 3) return coords

  function perpendicular(p: Coord, a: Coord, b: Coord) {
    const mLat = 111_320
    const mLon = 111_320 * Math.cos(rad(p[1]))
    const [px, py] = [p[0] * mLon, p[1] * mLat]
    const [ax, ay] = [a[0] * mLon, a[1] * mLat]
    const [bx, by] = [b[0] * mLon, b[1] * mLat]
    const dx = bx - ax
    const dy = by - ay
    const lenSq = dx * dx + dy * dy
    if (lenSq === 0) return Math.hypot(px - ax, py - ay)
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
  }

  const keep = new Uint8Array(coords.length)
  keep[0] = 1
  keep[coords.length - 1] = 1
  const stack: [number, number][] = [[0, coords.length - 1]]

  while (stack.length > 0) {
    const [first, last] = stack.pop()!
    let maxDist = 0
    let index = -1
    for (let i = first + 1; i < last; i++) {
      const d = perpendicular(coords[i], coords[first], coords[last])
      if (d > maxDist) {
        maxDist = d
        index = i
      }
    }
    if (index !== -1 && maxDist > toleranceM) {
      keep[index] = 1
      stack.push([first, index], [index, last])
    }
  }

  return coords.filter((_, i) => keep[i] === 1)
}

/** Split where a line steps across the antimeridian, inserting seam vertices. */
export function insertSeamVertices(coords: Coord[]): Coord[] {
  const out: Coord[] = []
  for (let i = 0; i < coords.length; i++) {
    const cur = coords[i]
    const prev = coords[i - 1]
    if (prev && Math.abs(cur[0] - prev[0]) > 180) {
      const eastward = cur[0] < prev[0]
      const span = eastward ? 360 - prev[0] + cur[0] : 360 + prev[0] - cur[0]
      const toSeam = eastward ? 180 - prev[0] : 180 + prev[0]
      const t = span === 0 ? 0.5 : toSeam / span
      const lat = prev[1] + (cur[1] - prev[1]) * t
      out.push([eastward ? 180 : -180, lat], [eastward ? -180 : 180, lat])
    }
    out.push(cur)
  }
  return out
}

export function toWkt(coords: Coord[]) {
  return `SRID=4326;LINESTRING(${coords
    .map(([lon, lat]) => `${lon.toFixed(5)} ${lat.toFixed(5)}`)
    .join(',')})`
}
