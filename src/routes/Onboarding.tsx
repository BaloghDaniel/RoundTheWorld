import { useEffect, useState } from 'react'
import PlaceSearch from '../components/PlaceSearch'
import { createGoalRoute, placeFromCoords, startRouteJourney, type Place } from '../lib/goals'
import { currentPosition, startJourney } from '../lib/journey'
import Avatar from '../components/Avatar'
import { fetchFriends, startGroupJourney, type Friend } from '../lib/social'

type Props = { onStarted: (journeyId?: string) => void; onCancel?: () => void }
type Kind = 'world' | 'goal'

const today = new Date().toISOString().slice(0, 10)

export default function Onboarding({ onStarted, onCancel }: Props) {
  const [kind, setKind] = useState<Kind | null>(null)
  // Today by default: a new goal starts from now, not from history.
  const [from, setFrom] = useState(today)
  const [origin, setOrigin] = useState<Place | null>(null)
  const [goal, setGoal] = useState<Place | null>(null)
  const [here, setHere] = useState<{ lon: number; lat: number } | null>(null)
  const [locating, setLocating] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [friends, setFriends] = useState<Friend[]>([])
  const [invited, setInvited] = useState<Set<string>>(new Set())

  // The starting point defaults to where the user actually is. Refusing the
  // permission is fine: the world route then begins at its own origin, and a
  // goal route simply needs a start to be chosen by hand.
  useEffect(() => {
    let active = true
    currentPosition().then((p) => {
      if (!active) return
      setHere(p)
      setLocating(false)
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    fetchFriends()
      .then((all) => setFriends(all.filter((f) => f.status === 'accepted')))
      .catch(() => setFriends([]))
  }, [])

  const startPlace = origin ?? (here ? placeFromCoords(here.lon, here.lat) : null)

  async function begin() {
    setError(null)
    try {
      let journeyId: string
      if (kind === 'world') {
        setBusy('Starting…')
        journeyId = await startJourney({ from, lon: startPlace?.lon, lat: startPlace?.lat })
      } else {
        if (!startPlace) throw new Error('Choose where you are starting from')
        if (!goal) throw new Error('Choose where you are heading')
        setBusy('Finding a road route…')
        const route = await createGoalRoute(startPlace, goal)
        setBusy('Starting…')
        journeyId =
          invited.size > 0
            ? await startGroupJourney({
                routeId: route.route_id,
                from,
                mode: 'tag_along',
                invitees: [...invited],
              })
            : await startRouteJourney(route.route_id, from)
      }
      onStarted(journeyId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start your journey')
      setBusy(null)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-7 px-6 py-16">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          {onCancel ? 'Start a new journey' : 'Start a journey'}
        </h1>
        <p className="text-pretty text-sm leading-relaxed text-slate-400">
          Your runs and rides are laid end to end along real roads. You never
          have to run the route itself — the distance is what counts.
          {onCancel && ' Starting a new journey replaces your current one.'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ['world', 'Around the world', '64,381 km'],
            ['goal', 'City to city', 'Pick a target'],
          ] as const
        ).map(([id, title, hint]) => (
          <button
            key={id}
            type="button"
            onClick={() => setKind(id)}
            aria-pressed={kind === id}
            className={`rounded-xl border px-3 py-3 text-left transition ${
              kind === id
                ? 'border-route bg-route/10'
                : 'border-white/15 bg-ink-soft hover:bg-white/5'
            }`}
          >
            <div className="text-sm font-medium text-white">{title}</div>
            <div className="text-xs text-slate-500">{hint}</div>
          </button>
        ))}
      </div>

      {kind && (
      <PlaceSearch
        label="Starting from"
        value={origin}
        onChange={setOrigin}
        placeholder="Search for a place"
        emptyHint={
          locating
            ? 'Finding your location…'
            : here
              ? `Using your current position (${here.lat.toFixed(2)}, ${here.lon.toFixed(2)}). Search to pick somewhere else.`
              : 'Location unavailable — search for your starting point.'
        }
      />
      )}

      {kind === 'goal' && (
        <PlaceSearch
          label="Heading for"
          value={goal}
          onChange={setGoal}
          placeholder="Madrid, Rome, Berlin…"
        />
      )}

      {kind && (
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
          Everything you logged on or after this date counts. Backdate it to
          bring in runs you have already done.
        </span>
      </label>
      )}

      {kind === 'goal' && friends.length > 0 && (
        <div className="space-y-2">
          <span className="text-sm font-medium text-slate-200">Tag along</span>
          <ul className="space-y-2">
            {friends.map((f) => {
              const on = invited.has(f.id)
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setInvited((prev) => {
                        const next = new Set(prev)
                        if (on) next.delete(f.id)
                        else next.add(f.id)
                        return next
                      })
                    }
                    aria-pressed={on}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                      on ? 'border-route bg-route/10' : 'border-white/15 bg-ink-soft hover:bg-white/5'
                    }`}
                  >
                    <Avatar name={f.display_name} url={f.avatar_url} size={32} />
                    <span className="min-w-0 flex-1 truncate text-sm text-white">
                      {f.display_name}
                    </span>
                    <span className="text-xs text-slate-400">{on ? 'Invited' : 'Invite'}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="text-xs text-slate-500">
            You each run the whole distance. If one of you falls more than 100 km
            behind, the runner ahead waits until the party closes up.
          </p>
        </div>
      )}

      {kind === 'world' && (
        <p className="text-xs text-slate-500">
          The world route is a loop, so your starting point rotates it. You will
          be placed at the nearest point on the road.
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => void begin()}
        disabled={!kind || !!busy || locating || (kind === 'goal' && (!goal || !startPlace))}
        className="w-full rounded-2xl bg-route px-4 py-3.5 text-sm font-bold uppercase tracking-wide text-ink transition hover:brightness-110 disabled:opacity-60"
      >
        {busy ?? (kind ? 'Begin' : 'Choose a journey')}
      </button>

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="text-center text-xs text-slate-500 underline underline-offset-2 hover:text-slate-300"
        >
          Keep my current journey
        </button>
      )}

      {kind === 'goal' && goal && startPlace && !busy && (
        <p className="text-center text-xs text-slate-500">
          {startPlace.name} → {goal.name}
        </p>
      )}
    </main>
  )
}
