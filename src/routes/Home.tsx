import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

type StravaStatus = {
  connected: boolean
  athlete_id: number | null
  last_sync_at: string | null
}

const PHASES = [
  { n: 0, title: 'Repo, PWA shell, deploy pipeline', done: true },
  { n: 1, title: 'Supabase schema and Google login', done: true },
  { n: 2, title: 'Strava connection and activity sync', done: false },
  { n: 3, title: 'Build the land-first world route', done: false },
  { n: 4, title: 'Journey map and progress', done: false },
]

export default function Home() {
  const { user, signOut } = useAuth()
  const [strava, setStrava] = useState<StravaStatus | null>(null)

  useEffect(() => {
    supabase
      .rpc('my_strava_status')
      .single<StravaStatus>()
      .then(({ data }) => setStrava(data))
  }, [])

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-10 px-6 py-12">
      <header className="flex items-center gap-3">
        <img
          src={`${import.meta.env.BASE_URL}icons/icon-192.png`}
          alt=""
          className="size-10 rounded-lg"
          width={40}
          height={40}
        />
        <h1 className="font-semibold tracking-tight text-white">
          RoundTheWorld
        </h1>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-slate-400">
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

      <section className="rounded-xl border border-white/10 bg-ink-soft p-5">
        <h2 className="text-sm font-medium text-white">Strava</h2>
        <p className="mt-1 text-sm text-slate-400">
          {strava === null
            ? 'Checking…'
            : strava.connected
              ? `Connected as athlete ${strava.athlete_id}.`
              : 'Not connected yet — coming in the next phase.'}
        </p>
      </section>

      <ol className="space-y-px overflow-hidden rounded-xl border border-white/10">
        {PHASES.map((phase) => (
          <li
            key={phase.n}
            className="flex items-center gap-3 bg-ink-soft px-4 py-3 text-sm"
          >
            <span
              aria-hidden
              className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
                phase.done
                  ? 'bg-route text-ink'
                  : 'border border-white/15 text-slate-500'
              }`}
            >
              {phase.done ? '✓' : phase.n}
            </span>
            <span className={phase.done ? 'text-slate-200' : 'text-slate-500'}>
              {phase.title}
            </span>
            {phase.done && (
              <span className="ml-auto text-xs text-slate-500">done</span>
            )}
          </li>
        ))}
      </ol>
    </main>
  )
}
