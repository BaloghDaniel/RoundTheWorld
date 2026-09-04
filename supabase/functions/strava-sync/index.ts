// Pulls the caller's recent Strava activities into the database.
//
// Only distance, type and date are stored. GPS tracks are never requested,
// because the journey is drawn on our own route geometry.

import { adminClient, callerId, corsHeaders, json } from '../_shared/http.ts'
import { COUNTED_SPORT_TYPES, listActivities, refresh } from '../_shared/strava.ts'

// Strava permits 100 non-upload requests per 15 minutes. Syncing more often
// than this achieves nothing: activities do not appear that fast.
const MIN_SYNC_INTERVAL_MS = 15 * 60 * 1000
const DEFAULT_LOOKBACK_DAYS = 365

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const userId = await callerId(req)
  if (!userId) return json({ error: 'Not signed in' }, 401)

  const force = new URL(req.url).searchParams.get('force') === '1'
  const db = adminClient()

  const { data: connection } = await db
    .from('strava_connections')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (!connection) return json({ error: 'Strava is not connected' }, 400)

  if (!force && connection.last_sync_at) {
    const since = Date.now() - new Date(connection.last_sync_at).getTime()
    if (since < MIN_SYNC_INTERVAL_MS) {
      return json({ skipped: 'synced recently', last_sync_at: connection.last_sync_at })
    }
  }

  // Refresh a minute early rather than racing the expiry.
  let accessToken = connection.access_token
  if (new Date(connection.expires_at).getTime() - Date.now() < 60_000) {
    try {
      const next = await refresh(connection.refresh_token)
      accessToken = next.access_token
      await db
        .from('strava_connections')
        .update({
          access_token: next.access_token,
          refresh_token: next.refresh_token,
          expires_at: new Date(next.expires_at * 1000).toISOString(),
        })
        .eq('user_id', userId)
    } catch {
      // A dead refresh token means the user revoked access on Strava's side.
      return json({ error: 'Strava authorisation expired, reconnect required' }, 401)
    }
  }

  // Sync back to the start of the active journey, so a journey backdated at
  // onboarding picks up the history it needs.
  const { data: journey } = await db
    .from('journeys')
    .select('activities_from')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()

  const from = journey?.activities_from
    ? new Date(journey.activities_from)
    : new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 86_400_000)
  const afterEpoch = Math.floor(from.getTime() / 1000)

  let activities
  try {
    activities = await listActivities(accessToken, afterEpoch)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Strava request failed' }, 502)
  }

  const rows = activities
    .filter((a) => COUNTED_SPORT_TYPES.has(a.sport_type))
    .map((a) => ({
      user_id: userId,
      strava_activity_id: a.id,
      sport_type: a.sport_type,
      name: a.name,
      distance_m: a.distance,
      moving_time_s: a.moving_time,
      start_date: a.start_date,
    }))

  if (rows.length > 0) {
    const { error } = await db
      .from('activities')
      .upsert(rows, { onConflict: 'user_id,strava_activity_id' })
    if (error) return json({ error: error.message }, 500)
  }

  await db
    .from('strava_connections')
    .update({ last_sync_at: new Date().toISOString() })
    .eq('user_id', userId)

  return json({
    fetched: activities.length,
    counted: rows.length,
    total_distance_m: rows.reduce((sum, r) => sum + r.distance_m, 0),
  })
})
