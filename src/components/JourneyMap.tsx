import {
  GeoJSONSource,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef } from 'react'
import type { Journey } from '../lib/journey'
import { coveredPortions, loadRoute, type RouteAsset } from '../lib/route'

// OpenFreeMap serves OSM vector tiles with no key and no usage limits.
const STYLE = 'https://tiles.openfreemap.org/styles/positron'

type Props = {
  journey: Journey
  /** Recentre on the marker whenever this changes. */
  focus?: number
}

function featureCollection(lines: [number, number][][]) {
  return {
    type: 'FeatureCollection' as const,
    features: lines
      .filter((coords) => coords.length > 1)
      .map((coords) => ({
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'LineString' as const, coordinates: coords },
      })),
  }
}

export default function JourneyMap({ journey, focus }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibreMap | null>(null)
  const marker = useRef<Marker | null>(null)
  const route = useRef<RouteAsset | null>(null)

  // Create the map once. Route geometry is added on load.
  useEffect(() => {
    if (!container.current || map.current) return

    const m = new MapLibreMap({
      container: container.current,
      style: STYLE,
      center: [journey.position.lon, journey.position.lat],
      zoom: 3,
      attributionControl: { compact: true },
    })
    map.current = m
    m.addControl(new NavigationControl({ showCompass: false }), 'top-right')

    m.on('load', async () => {
      const data = await loadRoute()
      route.current = data

      // Land and sea are separate sources so they can be styled differently:
      // a sea crossing is not a road and should not pretend to be one.
      const land = data.segments.filter((s) => s.mode === 'road')
      const water = data.segments.filter((s) => s.mode !== 'road')

      m.addSource('route-land', { type: 'geojson', data: featureCollection(land.map((s) => s.coords)) })
      m.addSource('route-sea', { type: 'geojson', data: featureCollection(water.map((s) => s.coords)) })
      m.addSource('covered', { type: 'geojson', data: featureCollection([]) })

      m.addLayer({
        id: 'route-land',
        type: 'line',
        source: 'route-land',
        paint: { 'line-color': '#94a3b8', 'line-width': 1.5, 'line-opacity': 0.7 },
      })
      m.addLayer({
        id: 'route-sea',
        type: 'line',
        source: 'route-sea',
        paint: {
          'line-color': '#94a3b8',
          'line-width': 1.5,
          'line-opacity': 0.6,
          'line-dasharray': [2, 2],
        },
      })
      m.addLayer({
        id: 'covered',
        type: 'line',
        source: 'covered',
        paint: { 'line-color': '#0284c7', 'line-width': 3.5 },
      })

      for (const l of data.landmarks) {
        new Marker({ color: '#64748b', scale: 0.45 })
          .setLngLat(l.at)
          .setPopup(new Popup({ offset: 12 }).setText(`${l.name}, ${l.country}`))
          .addTo(m)
      }

      drawProgress()
    })

    return () => {
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
    if (!m || !data || !m.getSource('covered')) return

    const source = m.getSource('covered') as GeoJSONSource
    source.setData(
      featureCollection(
        coveredPortions(data, journey.start_offset_m, journey.travelled_m),
      ),
    )

    const at: [number, number] = [journey.position.lon, journey.position.lat]
    if (marker.current) {
      marker.current.setLngLat(at)
    } else {
      const el = document.createElement('div')
      el.className =
        'size-4 rounded-full border-2 border-white bg-marker shadow-[0_0_0_4px_rgba(251,191,36,0.35)]'
      el.setAttribute('aria-label', 'Your position')
      marker.current = new Marker({ element: el }).setLngLat(at).addTo(m)
    }
  }

  useEffect(drawProgress, [journey])

  useEffect(() => {
    map.current?.flyTo({
      center: [journey.position.lon, journey.position.lat],
      zoom: 4,
      speed: 0.8,
    })
  }, [focus, journey.position.lon, journey.position.lat])

  return <div ref={container} className="size-full" />
}
