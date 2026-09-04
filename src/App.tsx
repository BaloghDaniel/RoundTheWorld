import { useAuth } from './lib/auth'
import Home from './routes/Home'
import SignIn from './routes/SignIn'

export default function App() {
  const { user, loading } = useAuth()

  // Hold the first paint until the session lookup settles, so a signed-in user
  // never sees the sign-in screen flash past on reload.
  if (loading) {
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

  return user ? <Home /> : <SignIn />
}
