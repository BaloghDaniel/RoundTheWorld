import {
  GeoJSONSource,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef } from 'react'
import { avatarMarker, DEFAULT_AVATAR } from '../lib/avatars'
import type { Journey } from '../lib/journey'
import {
  coveredPortions,
  loadRoute,
  splitAtSeam,
  type Piece,
  type RouteAsset,
} from '../lib/route'

// OpenFreeMap serves OSM vector tiles with no key and no usage limits.
const STYLE = 'https://tiles.openfreemap.org/styles/positron'

// Amber rather than a pure yellow, which disappears against a pale basemap.
const AHEAD = '#eab308'
const DONE = '#16a34a'
// A dark casing under both lines keeps them readable over any terrain.
const CASING = 'rgba(15,23,42,.55)'

type Props = {
  journey: Journey
  /** Recentre on the marker whenever this changes. */
  focus?: number
}

function collection(pieces: Piece[]) {
  return {
    type: 'FeatureCollection' as const,
    features: pieces.flatMap((p) =>
      splitAtSeam(p.coords).map((coords) => ({
        type: 'Feature' as const,
        properties: { mode: p.mode },
        geometry: { type: 'LineString' as const, coordinates: coords },
      })),
    ),
  }
}

export default function JourneyMap({ journey, focus }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibreMap | null>(null)
  const marker = useRef<Marker | null>(null)
  const route = useRef<RouteAsset | null>(null)

  useEffect(() => {
    if (!container.current || map.current) return

    const m = new MapLibreMap({
      container: container.current,
      style: STYLE,
      center: [10, 25],
      zoom: 0.8,
      // The whole point is seeing the entire route at once, so do not let the
      // user zoom out past the world or drift off it vertically.
      minZoom: 0.5,
      maxZoom: 12,
      attributionControl: { compact: true },
    })
    map.current = m
    m.addControl(new NavigationControl({ showCompass: false }), 'top-right')

    // MapLibre sizes itself once at construction. Inside a flex column the
    // container can still be collapsing when that happens, which leaves a
    // zero-sized canvas and an apparently missing map.
    const observer = new ResizeObserver(() => m.resize())
    observer.observe(container.current)

    m.on('load', async () => {
      const data = await loadRoute()
      route.current = data

      const whole: Piece[] = data.segments.map((s) => ({ mode: s.mode, coords: s.coords }))
      m.addSource('ahead', { type: 'geojson', data: collection(whole) })
      m.addSource('done', { type: 'geojson', data: collection([]) })

      // Casings first so both routes sit on a dark outline.
      for (const [id, source] of [
        ['ahead-casing', 'ahead'],
        ['done-casing', 'done'],
      ] as const) {
        m.addLayer({
          id,
          type: 'line',
          source,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': CASING, 'line-width': 6 },
        })
      }

      // A sea crossing is not a road and should not be drawn as one, whether
      // or not it has been covered yet.
      const dash: [number, number] = [2, 1.6]
      m.addLayer({
        id: 'ahead',
        type: 'line',
        source: 'ahead',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': AHEAD, 'line-width': 3 },
        filter: ['==', ['get', 'mode'], 'road'],
      })
      m.addLayer({
        id: 'ahead-sea',
        type: 'line',
        source: 'ahead',
        paint: { 'line-color': AHEAD, 'line-width': 3, 'line-dasharray': dash },
        filter: ['!=', ['get', 'mode'], 'road'],
      })
      m.addLayer({
        id: 'done',
        type: 'line',
        source: 'done',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': DONE, 'line-width': 4 },
        filter: ['==', ['get', 'mode'], 'road'],
      })
      m.addLayer({
        id: 'done-sea',
        type: 'line',
        source: 'done',
        paint: { 'line-color': DONE, 'line-width': 4, 'line-dasharray': dash },
        filter: ['!=', ['get', 'mode'], 'road'],
      })

      for (const l of data.landmarks) {
        new Marker({ color: '#475569', scale: 0.42 })
          .setLngLat(l.at)
          .setPopup(new Popup({ offset: 12 }).setText(`${l.name}, ${l.country}`))
          .addTo(m)
      }

      drawProgress()

      // Frame the entire route. Segments carry vertices on the date line, so
      // bounds are taken per drawn run rather than across a seam-spanning line.
      const bounds = new LngLatBounds()
      for (const seg of data.segments) {
        for (const run of splitAtSeam(seg.coords)) {
          for (const c of run) bounds.extend(c)
        }
      }
      if (!bounds.isEmpty()) {
        m.fitBounds(bounds, { padding: 24, animate: false })
      }
    })

    return () => {
      observer.disconnect()
      m.remove()
      map.current = null
      marker.current = null
    }
    // Only the initial position matters here; updates are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function drawProgress() {
    const m = map.current
    const data = route.current
    if (!m || !data || !m.getSource('done')) return

    const source = m.getSource('done') as GeoJSONSource
    source.setData(
      collection(coveredPortions(data, journey.start_offset_m, journey.travelled_m)),
    )

    const at: [number, number] = [journey.position.lon, journey.position.lat]
    if (marker.current) {
      marker.current.setLngLat(at)
    } else {
      marker.current = new Marker({ element: avatarMarker(DEFAULT_AVATAR) })
        .setLngLat(at)
        .addTo(m)
    }
  }

  useEffect(drawProgress, [journey])

  // Deliberately skips the first run: the map opens framed on the whole route,
  // and only an explicit "centre on me" should pull it in to the marker.
  const framed = useRef(false)
  useEffect(() => {
    if (!framed.current) {
      framed.current = true
      return
    }
    map.current?.flyTo({
      center: [journey.position.lon, journey.position.lat],
      zoom: 4,
      speed: 0.8,
    })
  }, [focus])

  // Absolutely positioned rather than h-full: the parent is a flex item whose
  // height comes from flex-grow and min-height, so its `height` is auto and a
  // percentage height on this child collapses to zero -- an invisible map.
  return <div ref={container} className="absolute inset-0" />
}
