import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import StravaBanner from '../components/StravaBanner'
import { fetchJourney, formatKm, type Journey } from '../lib/journey'
import { connectOutcome, fetchStravaStatus, syncStrava, type StravaStatus } from '../lib/strava'

// MapLibre is most of the bundle. Loading it only when a journey is on screen
// keeps the sign-in and list screens light.
const JourneyMap = lazy(() => import('../components/JourneyMap'))

function Readout({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <div className="eyebrow">{label}</div>
      <div className="readout truncate text-lg leading-tight">{value}</div>
      {hint && <div className="truncate text-[11px] text-slate-500">{hint}</div>}
    </div>
  )
}

export default function JourneyScreen({
  journey: initial,
  onBack,
}: {
  journey: Journey
  onBack: () => void
}) {
  const [journey, setJourney] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [focus, setFocus] = useState(0)
  const [strava, setStrava] = useState<StravaStatus | null>(null)

  const refresh = useCallback(async () => {
    const next = await fetchJourney(initial.journey_id)
    if (next) setJourney(next)
  }, [initial.journey_id])

  useEffect(() => {
    fetchStravaStatus().then(setStrava).catch(() => setStrava(null))
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.has('strava')) {
      setMessage(connectOutcome(params))
      window.history.replaceState({}, '', import.meta.env.BASE_URL)
    }
  }, [])

  async function sync() {
    setBusy(true)
    setMessage(null)
    try {
      const result = await syncStrava(true)
      await refresh()
      setMessage(
        result.skipped
          ? 'Already synced in the last 15 minutes.'
          : `Synced ${result.counted} activities.`,
      )
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setBusy(false)
    }
  }

  const pct = Math.min(100, (journey.travelled_m / journey.total_distance_m) * 100)
  const eta = journey.eta ? new Date(journey.eta) : null
  const title = journey.is_loop
    ? journey.route_name
    : `${journey.origin_name} → ${journey.destination_name}`

  return (
    // The map is the page. Everything else floats above it.
    <main className="relative h-dvh overflow-hidden">
      <Suspense fallback={<div className="absolute inset-0 animate-pulse bg-ink-soft" />}>
        <JourneyMap journey={journey} focus={focus} />
      </Suspense>

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between gap-3 p-3 pb-7">
        {/* Top bar */}
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to journeys"
            className="glass grid size-10 shrink-0 place-items-center text-slate-200 transition hover:bg-white/10"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 18 9 12l6-6" />
            </svg>
          </button>

          <div className="glass min-w-0 flex-1 px-3.5 py-2">
            <div className="eyebrow">{journey.is_loop ? 'Circumnavigation' : 'Goal'}</div>
            <div className="truncate text-sm font-semibold tracking-tight text-white">
              {title}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void sync()}
            disabled={busy || !strava?.connected}
            className="glass shrink-0 px-3.5 py-2.5 text-xs font-bold uppercase tracking-wide text-route transition hover:bg-white/10 disabled:opacity-50"
          >
            {busy ? '…' : 'Sync'}
          </button>
        </div>

        <div className="pointer-events-auto max-h-[68dvh] space-y-3 overflow-y-auto">
          {strava && !strava.connected && <StravaBanner />}

          {message && (
            <p role="status" className="glass px-4 py-2.5 text-xs text-amber-200">
              {message}
            </p>
          )}

          <div className="flex justify-start">
            <button
              type="button"
              onClick={() => setFocus((n) => n + 1)}
              className="glass px-3 py-2 text-[11px] font-medium text-slate-200 transition hover:bg-white/10"
            >
              Centre on me
            </button>
          </div>

          {/* Stats card */}
          <section className="glass space-y-4 px-4 py-4">
            {journey.completed && (
              <p className="rounded-xl bg-done/15 px-3 py-2 text-sm text-done">
                <span className="font-bold">You made it.</span>{' '}
                {journey.destination_name
                  ? `${journey.destination_name} reached in ${formatKm(journey.total_distance_m)}.`
                  : 'Journey complete.'}
              </p>
            )}

            <div>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="eyebrow">Travelled</div>
                  <div className="readout text-3xl leading-none">
                    {formatKm(journey.travelled_m)}
                  </div>
                </div>
                <div className="text-right">
                  {journey.laps > 0 && (
                    <span className="mr-2 rounded bg-marker/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-marker">
                      Lap {journey.laps + 1}
                    </span>
                  )}
                  <span className="readout text-xl">{pct.toFixed(1)}%</span>
                </div>
              </div>

              <div
                className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/10"
                role="progressbar"
                aria-valuenow={Math.round(pct)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className={`h-full rounded-full transition-[width] duration-700 ${
                    journey.completed ? 'bg-done' : 'bg-ahead'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Readout
                label="Last passed"
                value={journey.passed?.name ?? '—'}
                hint={
                  journey.passed
                    ? `${formatKm(journey.passed.behind_m)} back`
                    : 'Just starting out'
                }
              />
              <Readout
                label={journey.is_loop ? 'Next up' : 'Destination'}
                value={
                  journey.is_loop
                    ? (journey.next?.name ?? 'Home')
                    : (journey.destination_name ?? '—')
                }
                hint={`${formatKm(journey.remaining_m)} to go`}
              />
              <Readout
                label="Pace"
                value={`${(journey.pace_m_per_day / 1000).toFixed(1)} km`}
                hint="per day, so far"
              />
              <Readout
                label={journey.completed ? 'Arrived' : 'Projected'}
                value={
                  journey.completed
                    ? 'Done'
                    : eta
                      ? eta.toLocaleDateString(undefined, { year: 'numeric', month: 'short' })
                      : '—'
                }
                hint={journey.completed ? 'goal reached' : eta ? 'at this pace' : 'log an activity'}
              />
            </div>

            {journey.segment && journey.segment.mode !== 'road' && (
              <p className="rounded-xl bg-white/5 px-3 py-2 text-[11px] text-slate-400">
                <span className="font-semibold text-slate-300">At sea.</span>{' '}
                {journey.segment.reason}
              </p>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
