// Admin: list and delete users.
//
// Deleting an auth user needs the service role, which cannot go anywhere near
// the browser, so it lives here. Admin status is read server-side from the
// database on every call -- never taken from the request.

import { adminClient, callerId, corsHeaders, json } from '../_shared/http.ts'

/** Ends the app's access to an athlete's Strava data. */
async function deauthorizeStrava(token: string) {
  try {
    await fetch('https://www.strava.com/oauth/deauthorize', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    })
  } catch {
    // Best effort. A failure here must not block deleting the user; the token
    // is about to be destroyed either way.
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const callerUserId = await callerId(req)
  if (!callerUserId) return json({ error: 'Not signed in' }, 401)

  const db = adminClient()

  const { data: caller } = await db
    .from('profiles')
    .select('is_admin')
    .eq('id', callerUserId)
    .maybeSingle()

  if (!caller?.is_admin) return json({ error: 'Not an admin' }, 403)

  // ------------------------------------------------------------------ list
  if (req.method === 'GET') {
    const { data: profiles, error } = await db
      .from('profiles')
      .select('id, display_name, handle, avatar_url, is_admin, created_at')
      .order('created_at', { ascending: true })
    if (error) return json({ error: error.message }, 500)

    // Emails and sign-in times live in auth, not in profiles.
    const { data: authUsers } = await db.auth.admin.listUsers({ perPage: 1000 })
    const authById = new Map(authUsers.users.map((u) => [u.id, u]))

    const [{ data: connections }, { data: activityRows }, { data: journeyRows }] =
      await Promise.all([
        db.from('strava_connections').select('user_id, athlete_id, last_sync_at'),
        db.from('activities').select('user_id'),
        db.from('journeys').select('user_id'),
      ])

    const count = (rows: { user_id: string }[] | null, id: string) =>
      (rows ?? []).filter((r) => r.user_id === id).length

    return json({
      users: profiles.map((p) => {
        const auth = authById.get(p.id)
        const strava = (connections ?? []).find((c) => c.user_id === p.id)
        return {
          ...p,
          email: auth?.email ?? null,
          last_sign_in_at: auth?.last_sign_in_at ?? null,
          strava_athlete_id: strava?.athlete_id ?? null,
          strava_last_sync_at: strava?.last_sync_at ?? null,
          activities: count(activityRows, p.id),
          journeys: count(journeyRows, p.id),
          is_you: p.id === callerUserId,
        }
      }),
    })
  }

  // ---------------------------------------------------------------- delete
  if (req.method === 'POST') {
    let userId: string
    try {
      const body = await req.json()
      userId = body.user_id
      if (typeof userId !== 'string' || !userId) throw new Error('bad id')
    } catch {
      return json({ error: 'Expected { user_id }' }, 400)
    }

    // Deleting yourself would lock the only admin out of their own tool.
    if (userId === callerUserId) {
      return json({ error: 'You cannot delete your own account here' }, 400)
    }

    // Release the Strava authorisation first. Dropping our row alone would
    // leave the athlete counted against the app's connected-athlete limit.
    const { data: connection } = await db
      .from('strava_connections')
      .select('access_token')
      .eq('user_id', userId)
      .maybeSingle()
    if (connection?.access_token) await deauthorizeStrava(connection.access_token)

    // Everything else — profile, journeys, activities, friendships, group
    // membership — cascades from auth.users.
    const { error } = await db.auth.admin.deleteUser(userId)
    if (error) return json({ error: error.message }, 500)

    return json({ deleted: userId, strava_released: !!connection?.access_token })
  }

  return json({ error: 'Method not allowed' }, 405)
})
