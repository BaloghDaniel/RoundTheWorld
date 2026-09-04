import { supabase } from './supabase'

export type StravaStatus = {
  connected: boolean
  athlete_id: number | null
  last_sync_at: string | null
}

export type SyncResult = {
  fetched?: number
  counted?: number
  total_distance_m?: number
  skipped?: string
  last_sync_at?: string
}

async function authHeader() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Not signed in')
  return { Authorization: `Bearer ${token}` }
}

function functionsUrl(name: string) {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`
}

export async function fetchStravaStatus(): Promise<StravaStatus | null> {
  const { data, error } = await supabase.rpc('my_strava_status').single<StravaStatus>()
  if (error) throw error
  return data
}

/**
 * Hands off to Strava's consent screen.
 *
 * The URL is built server-side so the browser never needs the client id, and
 * so the `state` parameter can be signed with a secret we do not ship.
 */
export async function beginStravaConnect() {
  const res = await fetch(functionsUrl('strava-auth-start'), {
    headers: await authHeader(),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'Could not start Strava connection')
  window.location.assign(body.url)
}

export async function syncStrava(force = false): Promise<SyncResult> {
  const res = await fetch(functionsUrl(`strava-sync${force ? '?force=1' : ''}`), {
    method: 'POST',
    headers: await authHeader(),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'Sync failed')
  return body
}

export async function disconnectStrava() {
  const { error } = await supabase.rpc('disconnect_strava')
  if (error) throw error
}

/** Human-readable explanation for the ?strava= parameter the callback sets. */
export function connectOutcome(params: URLSearchParams): string | null {
  switch (params.get('strava')) {
    case 'connected':
      return null // success needs no message; the UI simply shows connected
    case 'denied':
      return params.get('detail') === 'missing_scope'
        ? 'Strava was connected without permission to read activities, so there is nothing to sync. Try again and leave the activity permission ticked.'
        : 'Strava connection was cancelled.'
    case 'error':
      switch (params.get('detail')) {
        case 'athlete_taken':
          return 'That Strava account is already connected to a different RoundTheWorld user.'
        case 'bad_state':
          return 'That connection link expired. Please try again.'
        case 'server_misconfigured':
          return 'Strava is not configured on the server yet.'
        default:
          return 'Could not connect to Strava. Please try again.'
      }
    default:
      return null
  }
}
