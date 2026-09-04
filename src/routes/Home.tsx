import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import {
  beginStravaConnect,
  connectOutcome,
  disconnectStrava,
  fetchStravaStatus,
  syncStrava,
  type StravaStatus,
  type SyncResult,
} from '../lib/strava'

const PHASES = [
  { n: 0, title: 'Repo, PWA shell, deploy pipeline', done: true },
  { n: 1, title: 'Supabase schema and Google login', done: true },
  { n: 2, title: 'Strava connection and activity sync', done: true },
  { n: 3, title: 'Build the land-first world route', done: false },
  { n: 4, title: 'Journey map and progress', done: false },
]

const km = (m: number) => `${(m / 1000).toFixed(1)} km`

export default function Home() {
  const { user, signOut } = useAuth()
  const [status, setStatus] = useState<StravaStatus | null>(null)
  const [sync, setSync] = useState<SyncResult | null>(null)
  const [busy, setBusy] = useState<'connect' | 'sync' | 'disconnect' | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setStatus(await fetchStravaStatus())
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not read Strava status')
    }
  }, [])

  // Surface whatever the OAuth callback reported, then strip the query so a
  // reload does not replay a stale message.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.has('strava')) {
      setMessage(connectOutcome(params))
      window.history.replaceState({}, '', import.meta.env.BASE_URL)
    }
    void refresh()
  }, [refresh])

  async function run(kind: 'connect' | 'sync' | 'disconnect', action: () => Promise<unknown>) {
    setBusy(kind)
    setMessage(null)
    try {
      const result = await action()
      if (kind === 'sync') setSync(result as SyncResult)
      if (kind === 'disconnect') setSync(null)
      if (kind !== 'connect') await refresh()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      // A successful connect navigates away, so leaving it busy is correct.
      if (kind !== 'connect') setBusy(null)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="flex items-center gap-3">
        <img
          src={`${import.meta.env.BASE_URL}icons/icon-192.png`}
          alt=""
          className="size-10 rounded-lg"
          width={40}
          height={40}
        />
        <h1 className="font-semibold tracking-tight text-white">RoundTheWorld</h1>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm text-slate-400 sm:inline">
            {user?.user_metadata?.full_name ?? user?.email}
          </span>
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/5"
          >
            Sign out
          </button>
        </div>
      </header>

      {message && (
        <p
          role="alert"
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
        >
          {message}
        </p>
      )}

      <section className="rounded-xl border border-white/10 bg-ink-soft p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-medium text-white">Strava</h2>
            <p className="mt-1 text-sm text-slate-400">
              {status === null
                ? 'Checking…'
                : status.connected
                  ? `Connected as athlete ${status.athlete_id}.`
                  : 'Connect Strava to start counting your distance.'}
            </p>
            {status?.last_sync_at && (
              <p className="mt-1 text-xs text-slate-500">
                Last synced {new Date(status.last_sync_at).toLocaleString()}
              </p>
            )}
          </div>

          {status?.connected ? (
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => void run('sync', () => syncStrava(true))}
                disabled={busy !== null}
                className="rounded-lg bg-route px-3 py-2 text-xs font-medium text-ink transition hover:brightness-110 disabled:opacity-60"
              >
                {busy === 'sync' ? 'Syncing…' : 'Sync now'}
              </button>
              <button
                type="button"
                onClick={() => void run('disconnect', disconnectStrava)}
                disabled={busy !== null}
                className="rounded-lg border border-white/15 px-3 py-2 text-xs text-slate-300 transition hover:bg-white/5 disabled:opacity-60"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void run('connect', beginStravaConnect)}
              disabled={busy !== null || status === null}
              className="shrink-0 rounded-lg bg-[#FC4C02] px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-60"
            >
              {busy === 'connect' ? 'Redirecting…' : 'Connect Strava'}
            </button>
          )}
        </div>

        {sync && (
          <p className="mt-4 border-t border-white/10 pt-4 text-sm text-slate-300">
            {sync.skipped
              ? 'Already synced in the last 15 minutes.'
              : `Synced ${sync.counted} of ${sync.fetched} activities — ${km(sync.total_distance_m ?? 0)} in total.`}
          </p>
        )}

        {status?.connected && (
          <p className="mt-3 text-xs text-slate-500">
            Disconnecting deletes your stored activities as well as the
            connection.
          </p>
        )}
      </section>

      <ol className="space-y-px overflow-hidden rounded-xl border border-white/10">
        {PHASES.map((phase) => (
          <li key={phase.n} className="flex items-center gap-3 bg-ink-soft px-4 py-3 text-sm">
            <span
              aria-hidden
              className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
                phase.done ? 'bg-route text-ink' : 'border border-white/15 text-slate-500'
              }`}
            >
              {phase.done ? '✓' : phase.n}
            </span>
            <span className={phase.done ? 'text-slate-200' : 'text-slate-500'}>
              {phase.title}
            </span>
          </li>
        ))}
      </ol>

      <p className="text-xs text-slate-500">Activity data from Strava.</p>
    </main>
  )
}
