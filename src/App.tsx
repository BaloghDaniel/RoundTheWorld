import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './lib/auth'
import { fetchJourney, type Journey } from './lib/journey'
import { fetchStravaStatus, type StravaStatus } from './lib/strava'
import ConnectStrava from './routes/ConnectStrava'
import FindFriends from './routes/FindFriends'
import JourneyScreen from './routes/Journey'
import Journeys from './routes/Journeys'
import MapCheck from './routes/MapCheck'
import Onboarding from './routes/Onboarding'
import Profile from './routes/Profile'
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

type View =
  | { name: 'list' }
  | { name: 'new' }
  | { name: 'detail'; id: string }
  | { name: 'profile' }
  | { name: 'friends' }

export default function App() {
  const { user, loading } = useAuth()
  const [strava, setStrava] = useState<StravaStatus | null | undefined>(undefined)
  const [view, setView] = useState<View>({ name: 'list' })
  const [journey, setJourney] = useState<Journey | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      setStrava(undefined)
      return
    }
    fetchStravaStatus()
      .then(setStrava)
      .catch(() => setStrava(null))
  }, [user])

  const openJourney = useCallback(async (id: string) => {
    setJourney(undefined)
    setView({ name: 'detail', id })
    try {
      setJourney(await fetchJourney(id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load that journey')
      setJourney(null)
    }
  }, [])

  // ?mapcheck renders the real map component with a synthetic journey and no
  // session, so the deployed bundle can be diagnosed without signing in.
  if (new URLSearchParams(window.location.search).has('mapcheck')) return <MapCheck />

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

  if (strava === undefined) return <Spinner />

  // Nothing to measure a journey with until Strava is connected, so ask for
  // that first rather than starting a journey that cannot move.
  if (!strava?.connected) {
    return <ConnectStrava onConnected={() => void fetchStravaStatus().then(setStrava)} />
  }

  if (view.name === 'profile') {
    return (
      <Profile
        onBack={() => setView({ name: 'list' })}
        onFindFriends={() => setView({ name: 'friends' })}
      />
    )
  }

  if (view.name === 'friends') {
    return <FindFriends onBack={() => setView({ name: 'profile' })} />
  }

  if (view.name === 'new') {
    return (
      <Onboarding
        onStarted={(id) => (id ? void openJourney(id) : setView({ name: 'list' }))}
        onCancel={() => setView({ name: 'list' })}
      />
    )
  }

  if (view.name === 'detail') {
    if (journey === undefined) return <Spinner />
    if (journey === null) {
      setView({ name: 'list' })
      return <Spinner />
    }
    return <JourneyScreen journey={journey} onBack={() => setView({ name: 'list' })} />
  }

  return (
    <Journeys
      onOpen={(id) => void openJourney(id)}
      onNew={() => setView({ name: 'new' })}
      onProfile={() => setView({ name: 'profile' })}
    />
  )
}
