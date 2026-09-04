import { useEffect, useState } from 'react'
import { currentPosition, startJourney } from '../lib/journey'

type Props = { onStarted: () => void }

const today = new Date().toISOString().slice(0, 10)
const yearStart = `${new Date().getFullYear()}-01-01`

export default function Onboarding({ onStarted }: Props) {
  const [from, setFrom] = useState(yearStart)
  const [place, setPlace] = useState<{ lon: number; lat: number } | null>(null)
  const [locating, setLocating] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Default the starting point to where the user actually is. Refusing the
  // permission is fine: the journey then begins at the route's own origin.
  useEffect(() => {
    let active = true
    currentPosition().then((p) => {
      if (!active) return
      setPlace(p)
      setLocating(false)
    })
    return () => {
      active = false
    }
  }, [])

  async function begin() {
    setBusy(true)
    setError(null)
    try {
      await startJourney({ from, lon: place?.lon, lat: place?.lat })
      onStarted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start your journey')
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6 py-16">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Start your journey
        </h1>
        <p className="text-pretty text-sm leading-relaxed text-slate-400">
          Your runs and rides are laid end to end along a 64,381 km road route
          around the world. You never have to run the route itself — the
          distance is what counts.
        </p>
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-slate-200">Count activities from</span>
        <input
          type="date"
          value={from}
          max={today}
          onChange={(e) => setFrom(e.target.value)}
          className="w-full rounded-xl border border-white/15 bg-ink-soft px-4 py-3 text-sm text-white [color-scheme:dark]"
        />
        <span className="block text-xs text-slate-500">
          Everything you logged on or after this date counts towards the journey.
        </span>
      </label>

      <div className="space-y-2">
        <span className="text-sm font-medium text-slate-200">Starting point</span>
        <div className="rounded-xl border border-white/15 bg-ink-soft px-4 py-3 text-sm">
          {locating ? (
            <span className="text-slate-400">Finding your location…</span>
          ) : place ? (
            <span className="text-slate-200">
              Your current position
              <span className="ml-2 text-xs text-slate-500">
                {place.lat.toFixed(2)}, {place.lon.toFixed(2)}
              </span>
            </span>
          ) : (
            <span className="text-slate-400">
              Stockholm — location unavailable, so the journey starts at the
              route's origin.
            </span>
          )}
        </div>
        <span className="block text-xs text-slate-500">
          The route is a loop, so your starting point simply rotates it. You will
          be placed at the nearest point on the road.
        </span>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => void begin()}
        disabled={busy || locating}
        className="w-full rounded-xl bg-route px-4 py-3 text-sm font-semibold text-ink transition hover:brightness-110 disabled:opacity-60"
      >
        {busy ? 'Starting…' : 'Begin'}
      </button>
    </main>
  )
}
