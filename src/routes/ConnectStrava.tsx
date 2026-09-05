import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { beginStravaConnect } from '../lib/strava'

/**
 * Shown before any journey exists.
 *
 * A journey with no activity source cannot move, so connecting Strava is the
 * first thing asked for rather than something to discover later.
 */
export default function ConnectStrava({ onConnected }: { onConnected: () => void }) {
  const { signOut } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function connect() {
    setBusy(true)
    setError(null)
    try {
      await beginStravaConnect()
      // Success navigates to Strava, so nothing follows here.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach Strava')
      setBusy(false)
    }
  }

  return (
    <main className="screen mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col items-center gap-5 text-center">
        <img
          src={`${import.meta.env.BASE_URL}icons/icon-192.png`}
          alt=""
          className="size-20 rounded-2xl"
          width={80}
          height={80}
        />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Connect Strava
          </h1>
          <p className="text-pretty text-sm leading-relaxed text-muted">
            Your runs and rides are what move you along a route. We read only
            the distance, type and date of each activity — never your GPS
            tracks.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void connect()}
        disabled={busy}
        className="w-full rounded-2xl bg-[#FC4C02] px-4 py-3.5 text-sm font-bold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {busy ? 'Redirecting…' : 'Connect Strava'}
      </button>

      {error && (
        <p role="alert" className="text-center text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex justify-center gap-4 text-xs text-muted">
        <button type="button" onClick={onConnected} className="underline underline-offset-2 hover:text-ink">
          I've connected it
        </button>
        <button type="button" onClick={() => void signOut()} className="underline underline-offset-2 hover:text-ink">
          Sign out
        </button>
      </div>
    </main>
  )
}
