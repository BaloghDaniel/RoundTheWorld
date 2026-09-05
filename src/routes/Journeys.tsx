import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { deleteJourney, fetchJourneys, formatKm, type JourneySummary } from '../lib/journey'

type Props = {
  onOpen: (id: string) => void
  onNew: () => void
}

function ProgressBar({ pct, done }: { pct: number; done: boolean }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
      <div
        className={`h-full rounded-full transition-[width] duration-700 ${
          done ? 'bg-done' : 'bg-ahead'
        }`}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  )
}

function JourneyCard({
  journey,
  onOpen,
  onDelete,
  deleting,
}: {
  journey: JourneySummary
  onOpen: () => void
  onDelete: () => void
  deleting: boolean
}) {
  const pct = Math.min(100, (journey.travelled_m / journey.total_distance_m) * 100)
  const title = journey.is_loop
    ? journey.route_name
    : `${journey.origin_name} → ${journey.destination_name}`

  return (
    <li className="glass overflow-hidden">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full px-4 pt-4 text-left transition hover:bg-white/5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-semibold tracking-tight text-white">{title}</div>
            <div className="eyebrow mt-0.5">
              {journey.is_loop ? 'Circumnavigation' : 'Goal'}
              {journey.laps > 0 && ` · lap ${journey.laps + 1}`}
            </div>
          </div>
          {journey.completed && (
            <span className="shrink-0 rounded-full bg-done/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-done">
              Done
            </span>
          )}
        </div>

        <div className="mt-3 flex items-baseline gap-2">
          <span className="readout text-2xl">{formatKm(journey.travelled_m)}</span>
          <span className="text-xs text-slate-500">
            of {formatKm(journey.total_distance_m)} · {pct.toFixed(1)}%
          </span>
        </div>

        <div className="mt-2.5">
          <ProgressBar pct={pct} done={journey.completed} />
        </div>
      </button>

      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="text-[11px] text-slate-500">
          Counting from {new Date(journey.activities_from).toLocaleDateString()}
        </span>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="text-[11px] text-slate-500 transition hover:text-red-400 disabled:opacity-50"
        >
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </li>
  )
}

export default function Journeys({ onOpen, onNew }: Props) {
  const { user, signOut } = useAuth()
  const [journeys, setJourneys] = useState<JourneySummary[] | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setJourneys(await fetchJourneys())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your journeys')
      setJourneys([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function remove(id: string) {
    setBusy(id)
    setError(null)
    try {
      await deleteJourney(id)
      setConfirming(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete that journey')
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-5 px-4 py-6">
      <header className="flex items-center gap-3">
        <img
          src={`${import.meta.env.BASE_URL}icons/icon-192.png`}
          alt=""
          className="size-9 rounded-lg"
          width={36}
          height={36}
        />
        <div className="min-w-0">
          <h1 className="font-semibold tracking-tight text-white">Your journeys</h1>
          <p className="truncate text-xs text-slate-500">
            {user?.user_metadata?.full_name ?? user?.email}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="ml-auto shrink-0 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/5"
        >
          Sign out
        </button>
      </header>

      {error && (
        <p role="alert" className="glass px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {journeys === null ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : journeys.length === 0 ? (
        <div className="glass space-y-3 px-5 py-8 text-center">
          <p className="font-semibold text-white">No journeys yet</p>
          <p className="text-pretty text-sm leading-relaxed text-slate-400">
            Pick somewhere to run to — a city across the continent, or the whole
            way around the world.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {journeys.map((j) => (
            <JourneyCard
              key={j.journey_id}
              journey={j}
              onOpen={() => onOpen(j.journey_id)}
              deleting={busy === j.journey_id}
              onDelete={() =>
                confirming === j.journey_id
                  ? void remove(j.journey_id)
                  : setConfirming(j.journey_id)
              }
            />
          ))}
        </ul>
      )}

      {confirming && (
        <p className="text-center text-xs text-amber-300">
          Tap Delete again to remove that journey. Your activities are untouched.
        </p>
      )}

      <button
        type="button"
        onClick={onNew}
        className="rounded-2xl bg-route px-4 py-3.5 text-sm font-bold uppercase tracking-wide text-ink transition hover:brightness-110"
      >
        New journey
      </button>
    </main>
  )
}
