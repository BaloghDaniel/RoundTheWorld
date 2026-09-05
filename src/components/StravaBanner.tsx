import { useState } from 'react'
import { beginStravaConnect } from '../lib/strava'

/** Shown on the journey screen until Strava is connected — without it there is
 *  no distance to count, so it needs to be the obvious next action. */
export default function StravaBanner() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function connect() {
    setBusy(true)
    setError(null)
    try {
      await beginStravaConnect()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach Strava')
      setBusy(false)
    }
  }

  return (
    <div className="mx-4 mb-2 flex items-center gap-3 rounded-xl border border-[#FC4C02]/40 bg-[#FC4C02]/10 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">Connect Strava to start moving</p>
        <p className="text-xs text-muted">
          We read only the distance, type and date of each activity — never your
          GPS tracks.
        </p>
      </div>
      <button
        type="button"
        onClick={() => void connect()}
        disabled={busy}
        className="shrink-0 rounded-lg bg-[#FC4C02] px-3 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {busy ? 'Redirecting…' : 'Connect'}
      </button>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
