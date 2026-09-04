// Begins the Strava OAuth flow. Called by the signed-in browser; returns the
// Strava authorize URL for the client to navigate to.
//
// The client secret never appears here — only the public client id — but the
// state token is signed so the callback can trust which user is returning.

import { callerId, corsHeaders, json } from '../_shared/http.ts'
import { signState } from '../_shared/state.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const userId = await callerId(req)
  if (!userId) return json({ error: 'Not signed in' }, 401)

  const clientId = Deno.env.get('STRAVA_CLIENT_ID')
  const stateSecret = Deno.env.get('STRAVA_STATE_SECRET')
  if (!clientId || !stateSecret) {
    return json({ error: 'Strava is not configured on the server' }, 500)
  }

  const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/strava-callback`

  const authorize = new URL('https://www.strava.com/oauth/authorize')
  authorize.searchParams.set('client_id', clientId)
  authorize.searchParams.set('redirect_uri', redirectUri)
  authorize.searchParams.set('response_type', 'code')
  authorize.searchParams.set('approval_prompt', 'auto')
  // activity:read covers the athlete's own activities. We never ask for write
  // scope, and never request activity:read_all (private activities).
  authorize.searchParams.set('scope', 'activity:read')
  authorize.searchParams.set('state', await signState(userId, stateSecret))

  return json({ url: authorize.toString() })
})
