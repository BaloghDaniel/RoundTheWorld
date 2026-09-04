// Where Strava sends the browser back after the user approves access.
//
// This runs without a JWT — it is a plain browser redirect — so it must be
// deployed with verify_jwt disabled, and the signed `state` is the only thing
// establishing which user is connecting.

import { adminClient, appUrl } from '../_shared/http.ts'
import { verifyState } from '../_shared/state.ts'
import { exchangeCode } from '../_shared/strava.ts'

function backToApp(status: string, detail?: string) {
  const url = new URL(appUrl())
  url.searchParams.set('strava', status)
  if (detail) url.searchParams.set('detail', detail)
  return Response.redirect(url.toString(), 302)
}

Deno.serve(async (req) => {
  const params = new URL(req.url).searchParams

  // The user pressed "Cancel" on Strava's consent screen.
  if (params.get('error')) return backToApp('denied')

  const code = params.get('code')
  const state = params.get('state')
  const scope = params.get('scope') ?? ''
  if (!code || !state) return backToApp('error', 'missing_code')

  const stateSecret = Deno.env.get('STRAVA_STATE_SECRET')
  if (!stateSecret) return backToApp('error', 'server_misconfigured')

  const userId = await verifyState(state, stateSecret)
  if (!userId) return backToApp('error', 'bad_state')

  // Without read access to activities the connection is useless, so say so
  // rather than storing a token that can never sync anything.
  if (!scope.includes('activity:read')) return backToApp('denied', 'missing_scope')

  try {
    const tokens = await exchangeCode(code)
    const athleteId = tokens.athlete?.id
    if (!athleteId) return backToApp('error', 'no_athlete')

    const { error } = await adminClient()
      .from('strava_connections')
      .upsert(
        {
          user_id: userId,
          athlete_id: athleteId,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: new Date(tokens.expires_at * 1000).toISOString(),
          scope,
        },
        { onConflict: 'user_id' },
      )

    if (error) {
      // A unique violation on athlete_id means this Strava account is already
      // attached to a different app user.
      return backToApp('error', error.code === '23505' ? 'athlete_taken' : 'save_failed')
    }

    return backToApp('connected')
  } catch {
    return backToApp('error', 'exchange_failed')
  }
})
