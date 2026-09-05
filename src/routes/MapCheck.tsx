import { lazy, Suspense, useEffect, useState } from 'react'
import type { Journey } from '../lib/journey'

const JourneyMap = lazy(() => import('../components/JourneyMap'))
// ?mapcheck=ui renders the real journey screen with the same fixture, so the
// layout can be reviewed without a session or any Strava data.
const JourneyScreen = lazy(() => import('./Journey'))

// A journey with no database behind it, so this page renders the real map
// component, in the real bundle, without needing a session.
const FAKE: Journey = {
  journey_id: 'mapcheck',
  route_id: '00000000-0000-0000-0000-000000000000',
  route_slug: 'world',
  route_name: 'Around the World',
  is_loop: true,
  completed: false,
  origin_name: null,
  destination_name: null,
  remaining_m: 64_180_407,
  pace_m_per_day: 815,
  eta: null,
  activities_from: '2026-01-01',
  travelled_m: 201_000,
  total_distance_m: 64_381_407,
  start_offset_m: 15_000,
  laps: 0,
  route_offset_m: 216_000,
  position: { lon: 15.3526, lat: 58.3798 },
  segment: { mode: 'road', reason: null },
  passed: { name: 'Stockholm', country: 'Sweden', behind_m: 216_000 },
  next: { name: 'Copenhagen', country: 'Denmark', ahead_m: 441_000 },
}

function measure() {
  const rows: string[] = []
  const box = (label: string, el: Element | null) =>
    rows.push(
      el
        ? `${label}: ${Math.round(el.getBoundingClientRect().width)} x ${Math.round(el.getBoundingClientRect().height)}`
        : `${label}: MISSING`,
    )

  box('outer (min-h-[55dvh] flex-1)', document.querySelector('[data-mapbox]'))
  box('map container', document.querySelector('[data-mapbox] > div'))
  box('.maplibregl-map', document.querySelector('.maplibregl-map'))
  box('.maplibregl-canvas-container', document.querySelector('.maplibregl-canvas-container'))

  const canvas = document.querySelector('canvas.maplibregl-canvas') as HTMLCanvasElement | null
  rows.push(
    canvas
      ? `canvas attr: ${canvas.width} x ${canvas.height} | css: ${canvas.style.width} x ${canvas.style.height}`
      : 'canvas: MISSING',
  )

  // Is MapLibre's own stylesheet actually applied? A lazily loaded chunk pulls
  // its CSS in at runtime, and if that fails the map has no layout rules.
  let maplibreRules = 0
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        if ((rule as CSSStyleRule).selectorText?.includes('maplibregl')) maplibreRules++
      }
    } catch {
      rows.push('(a stylesheet was cross-origin and could not be read)')
    }
  }
  rows.push(`maplibre CSS rules found: ${maplibreRules}`)
  rows.push(`webgl2: ${!!document.createElement('canvas').getContext('webgl2')}`)

  return rows.join('\n')
}

export default function MapCheck() {
  const [report, setReport] = useState('measuring…')
  const uiOnly = new URLSearchParams(window.location.search).get('mapcheck') === 'ui'

  useEffect(() => {
    const t = setInterval(() => setReport(measure()), 500)
    return () => clearInterval(t)
  }, [])

  if (uiOnly) {
    return (
      <Suspense fallback={null}>
        <JourneyScreen journey={FAKE} onBack={() => {}} />
      </Suspense>
    )
  }

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="px-4 py-3 text-sm font-semibold text-white">
        Map diagnostic
      </header>

      <div data-mapbox className="relative min-h-[55dvh] flex-1 overflow-hidden">
        <Suspense fallback={<div className="absolute inset-0 animate-pulse bg-ink-soft" />}>
          <JourneyMap journey={FAKE} />
        </Suspense>
      </div>

      <pre className="max-h-[35dvh] overflow-auto border-t border-white/10 bg-black px-3 py-2 text-[11px] leading-relaxed text-green-400">
        {report}
      </pre>
    </main>
  )
}
