const PHASES = [
  { n: 0, title: 'Repo, PWA shell, deploy pipeline', done: true },
  { n: 1, title: 'Supabase schema and Google login', done: false },
  { n: 2, title: 'Strava connection and activity sync', done: false },
  { n: 3, title: 'Build the land-first world route', done: false },
  { n: 4, title: 'Journey map and progress', done: false },
]

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-10 px-6 py-16">
      <header className="flex items-center gap-4">
        <img
          src={`${import.meta.env.BASE_URL}icons/icon-192.png`}
          alt=""
          className="size-14 rounded-xl"
          width={56}
          height={56}
        />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            RoundTheWorld
          </h1>
          <p className="text-sm text-slate-400">
            Every run and ride, laid end to end across the planet.
          </p>
        </div>
      </header>

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

      <p className="text-xs leading-relaxed text-slate-500">
        Phase 0 is live: this page is an installable PWA, deployed from{' '}
        <code className="text-slate-400">master</code> by GitHub Actions. Add it
        to your home screen and it will keep working offline.
      </p>
    </main>
  )
}
