export type Coord = [lon: number, lat: number]

const R = 6_371_008.8 // IUGG mean Earth radius, metres

const rad = (deg: number) => (deg * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

/** Great-circle distance in metres. */
export function haversine([lon1, lat1]: Coord, [lon2, lat2]: Coord) {
  const dLat = rad(lat2 - lat1)
  const dLon = rad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export function lineLength(coords: Coord[]) {
  let total = 0
  for (let i = 1; i < coords.length; i++) total += haversine(coords[i - 1], coords[i])
  return total
}

/**
 * Points along the great circle between two coordinates.
 *
 * Used only for sea crossings, where no road exists to follow. Interpolating
 * on the sphere rather than in lon/lat space keeps the drawn arc looking like
 * a real shipping track instead of a straight line across a flat map.
 */
export function greatCircle(from: Coord, to: Coord, steps = 64): Coord[] {
  const [lon1, lat1] = from.map(rad) as Coord
  const [lon2, lat2] = to.map(rad) as Coord

  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
      ),
    )
  if (d === 0) return [from, to]

  const out: Coord[] = []
  for (let i = 0; i <= steps; i++) {
    const f = i / steps
    const a = Math.sin((1 - f) * d) / Math.sin(d)
    const b = Math.sin(f * d) / Math.sin(d)
    const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2)
    const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2)
    const z = a * Math.sin(lat1) + b * Math.sin(lat2)
    out.push([deg(Math.atan2(y, x)), deg(Math.atan2(z, Math.hypot(x, y)))])
  }
  return out
}

/**
 * Ramer-Douglas-Peucker simplification, with the tolerance given in metres.
 *
 * A full-resolution road route around the world is tens of megabytes, which is
 * far more detail than a map showing a whole continent can display. Thinning
 * it costs nothing visible and keeps the seed data reviewable in git.
 */
export function simplify(coords: Coord[], toleranceM: number): Coord[] {
  if (coords.length < 3) return coords

  // Perpendicular distance from `p` to the segment `a`-`b`, in metres. Working
  // in a local flat projection is accurate enough at simplification scale.
  function perpendicular(p: Coord, a: Coord, b: Coord) {
    const mPerDegLat = 111_320
    const mPerDegLon = 111_320 * Math.cos(rad(p[1]))
    const px = p[0] * mPerDegLon
    const py = p[1] * mPerDegLat
    const ax = a[0] * mPerDegLon
    const ay = a[1] * mPerDegLat
    const bx = b[0] * mPerDegLon
    const by = b[1] * mPerDegLat

    const dx = bx - ax
    const dy = by - ay
    const lenSq = dx * dx + dy * dy
    if (lenSq === 0) return Math.hypot(px - ax, py - ay)

    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
  }

  // Iterative rather than recursive: a 200,000-point leg overflows the stack.
  const keep = new Uint8Array(coords.length)
  keep[0] = 1
  keep[coords.length - 1] = 1
  const stack: [number, number][] = [[0, coords.length - 1]]

  while (stack.length > 0) {
    const [first, last] = stack.pop()!
    let maxDist = 0
    let index = -1

    for (let i = first + 1; i < last; i++) {
      const dist = perpendicular(coords[i], coords[first], coords[last])
      if (dist > maxDist) {
        maxDist = dist
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

/** WKT for PostGIS, with coordinates trimmed to ~1 m precision. */
export function toWkt(coords: Coord[]) {
  const pairs = coords.map(([lon, lat]) => `${lon.toFixed(5)} ${lat.toFixed(5)}`)
  return `SRID=4326;LINESTRING(${pairs.join(',')})`
}

/**
 * Insert vertices exactly on the antimeridian wherever a line crosses it.
 *
 * A leg from 179.5°E to 178.2°W is a 1.3° step across the date line, but
 * stored as a 357.7° jump. Anything interpolating between those two vertices
 * -- PostGIS included -- travels the long way round the planet instead. Adding
 * a vertex at each seam keeps every consecutive pair short and unambiguous,
 * while leaving all longitudes inside the [-180, 180] that geography requires.
 */
export function insertSeamVertices(coords: Coord[]): Coord[] {
  const out: Coord[] = []

  for (let i = 0; i < coords.length; i++) {
    const cur = coords[i]
    const prev = coords[i - 1]

    if (prev && Math.abs(cur[0] - prev[0]) > 180) {
      // Fraction of the step at which the seam is reached, measured the short
      // way round rather than across the jump.
      const eastward = cur[0] < prev[0]
      const span = eastward
        ? 180 - prev[0] + (180 + cur[0])
        : 180 + prev[0] + (180 - cur[0])
      const toSeam = eastward ? 180 - prev[0] : 180 + prev[0]
      const t = span === 0 ? 0.5 : toSeam / span
      const lat = prev[1] + (cur[1] - prev[1]) * t

      out.push([eastward ? 180 : -180, lat])
      out.push([eastward ? -180 : 180, lat])
    }

    out.push(cur)
  }

  return out
}
