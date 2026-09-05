import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import StravaBanner from '../components/StravaBanner'

// MapLibre is most of the bundle. Loading it only when a journey is on screen
// keeps the sign-in and onboarding screens light.
const JourneyMap = lazy(() => import('../components/JourneyMap'))
import { useAuth } from '../lib/auth'
import { fetchJourney, formatKm, type Journey } from '../lib/journey'
import { connectOutcome, fetchStravaStatus, syncStrava, type StravaStatus } from '../lib/strava'

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="truncate text-lg font-semibold text-white">{value}</div>
      {hint && <div className="truncate text-xs text-slate-500">{hint}</div>}
    </div>
  )
}

export default function JourneyScreen({
  journey: initial,
  onNewJourney,
}: {
  journey: Journey
  onNewJourney: () => void
}) {
  const { user, signOut } = useAuth()
  const [journey, setJourney] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [focus, setFocus] = useState(0)
  const [strava, setStrava] = useState<StravaStatus | null>(null)

  const refresh = useCallback(async () => {
    const next = await fetchJourney()
    if (next) setJourney(next)
  }, [])

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

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-3 px-4 py-3">
        <img
          src={`${import.meta.env.BASE_URL}icons/icon-192.png`}
          alt=""
          className="size-8 rounded-lg"
          width={32}
          height={32}
        />
        <span className="font-semibold tracking-tight text-white">RoundTheWorld</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => void sync()}
            disabled={busy || !strava?.connected}
            className="rounded-lg bg-route px-3 py-1.5 text-xs font-medium text-ink transition hover:brightness-110 disabled:opacity-60"
          >
            {busy ? 'Syncing…' : 'Sync'}
          </button>
          <button
            type="button"
            onClick={onNewJourney}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/5"
          >
            New
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            title={user?.email ?? undefined}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/5"
          >
            Sign out
          </button>
        </div>
      </header>

      {strava && !strava.connected && <StravaBanner />}

      {message && (
        <p
          role="status"
          className="mx-4 mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
        >
          {message}
        </p>
      )}

      <div className="relative min-h-[55dvh] flex-1 overflow-hidden">
        <Suspense
          fallback={<div className="absolute inset-0 animate-pulse bg-ink-soft" />}
        >
          <JourneyMap journey={journey} focus={focus} />
        </Suspense>
        {/* The basemap is light, so the on-map readout is too. */}
        <div className="pointer-events-none absolute left-3 top-3 rounded-xl border border-black/10 bg-white/90 px-3 py-2 shadow-lg backdrop-blur">
          <div className="text-lg font-semibold leading-tight text-slate-900">
            {formatKm(journey.travelled_m)}
          </div>
          <div className="text-[11px] text-slate-600">
            of {formatKm(journey.total_distance_m)} · {pct.toFixed(1)}%
          </div>
          <div className="mt-1.5 flex gap-3 text-[10px] text-slate-600">
            <span className="flex items-center gap-1">
              <span aria-hidden className="h-0.5 w-4 rounded bg-[#16a34a]" />
              travelled
            </span>
            <span className="flex items-center gap-1">
              <span aria-hidden className="h-0.5 w-4 rounded bg-[#eab308]" />
              to go
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setFocus((n) => n + 1)}
          className="absolute bottom-3 left-3 rounded-lg border border-white/15 bg-ink/85 px-3 py-2 text-xs text-slate-200 backdrop-blur transition hover:bg-ink"
        >
          Centre on me
        </button>
      </div>

      <section className="space-y-4 border-t border-white/10 bg-ink px-4 py-4">
        <div>
          {!journey.is_loop && journey.destination_name && (
            <div className="mb-1 text-sm font-medium text-white">
              {journey.origin_name} → {journey.destination_name}
            </div>
          )}
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-slate-400">
              {journey.laps > 0 && (
                <span className="mr-2 rounded bg-marker/20 px-1.5 py-0.5 text-xs font-semibold text-marker">
                  Lap {journey.laps + 1}
                </span>
              )}
              {formatKm(journey.travelled_m)} travelled
            </span>
            <span className="text-sm text-slate-500">{pct.toFixed(1)}%</span>
          </div>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-route transition-[width] duration-700"
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat
            label="Last passed"
            value={journey.passed?.name ?? '—'}
            hint={
              journey.passed
                ? `${formatKm(journey.passed.behind_m)} back`
                : 'Just starting out'
            }
          />
          <Stat
            label={journey.is_loop ? 'Next up' : 'Destination'}
            value={
              journey.is_loop
                ? (journey.next?.name ?? 'Home')
                : (journey.destination_name ?? '—')
            }
            hint={`${formatKm(journey.remaining_m)} to go`}
          />
          <Stat
            label="Pace"
            value={`${(journey.pace_m_per_day / 1000).toFixed(1)} km`}
            hint="per day, so far"
          />
          <Stat
            label={journey.completed ? 'Arrived' : 'Projected'}
            value={
              journey.completed
                ? 'Done'
                : eta
                  ? eta.toLocaleDateString(undefined, { year: 'numeric', month: 'short' })
                  : '—'
            }
            hint={
              journey.completed
                ? 'goal reached'
                : eta
                  ? 'at this pace'
                  : 'log an activity'
            }
          />
        </div>

        {journey.completed && (
          <p className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-200">
            <span className="font-semibold">You made it.</span>{' '}
            {journey.destination_name
              ? `${journey.destination_name} reached in ${formatKm(journey.total_distance_m)}.`
              : 'Journey complete.'}
          </p>
        )}

        {journey.segment && journey.segment.mode !== 'road' && (
          <p className="rounded-lg border border-white/10 bg-ink-soft px-3 py-2 text-xs text-slate-400">
            <span className="font-medium text-slate-300">At sea.</span>{' '}
            {journey.segment.reason}
          </p>
        )}
      </section>
    </main>
  )
}
