import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './lib/auth'
import { fetchJourney, type Journey } from './lib/journey'
import Onboarding from './routes/Onboarding'
import JourneyScreen from './routes/Journey'
import SignIn from './routes/SignIn'

function Spinner() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <span className="sr-only">Loading</span>
      <span
        aria-hidden
        className="size-6 animate-spin rounded-full border-2 border-white/15 border-t-route"
      />
    </div>
  )
}

export default function App() {
  const { user, loading } = useAuth()
  // undefined = not looked up yet, null = signed in but no journey started.
  const [journey, setJourney] = useState<Journey | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setJourney(await fetchJourney())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your journey')
      setJourney(null)
    }
  }, [])

  useEffect(() => {
    if (user) void load()
    else setJourney(undefined)
  }, [user, load])

  if (loading) return <Spinner />
  if (!user) return <SignIn />

  if (error) {
    return (
      <div className="grid min-h-dvh place-items-center px-6">
        <p role="alert" className="max-w-sm text-center text-sm text-red-400">
          {error}
        </p>
      </div>
    )
  }

  if (journey === undefined) return <Spinner />
  if (journey === null) return <Onboarding onStarted={load} />
  return <JourneyScreen journey={journey} />
}
