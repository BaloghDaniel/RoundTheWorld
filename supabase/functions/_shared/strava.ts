// Strava API helpers shared by the connect and sync functions.

export const STRAVA_OAUTH = 'https://www.strava.com/oauth/token'
export const STRAVA_API = 'https://www.strava.com/api/v3'

/**
 * Activity types that count towards a journey.
 *
 * Motor-assisted types (EBikeRide, EMountainBikeRide) are deliberately absent:
 * they would inflate progress in a way that undermines the whole point.
 */
export const COUNTED_SPORT_TYPES = new Set([
  'Run',
  'TrailRun',
  'VirtualRun',
  'Ride',
  'GravelRide',
  'MountainBikeRide',
  'VirtualRide',
])

export type StravaTokens = {
  access_token: string
  refresh_token: string
  expires_at: number // epoch seconds
  athlete?: { id: number }
  scope?: string
}

export type StravaActivity = {
  id: number
  name: string
  sport_type: string
  distance: number // metres
  moving_time: number // seconds
  start_date: string // ISO 8601, UTC
}

function credentials() {
  const client_id = Deno.env.get('STRAVA_CLIENT_ID')
  const client_secret = Deno.env.get('STRAVA_CLIENT_SECRET')
  if (!client_id || !client_secret) {
    throw new Error('STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET must be set')
  }
  return { client_id, client_secret }
}

async function postToken(body: Record<string, string>): Promise<StravaTokens> {
  const res = await fetch(STRAVA_OAUTH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...credentials(), ...body }),
  })
  if (!res.ok) {
    throw new Error(`Strava token request failed (${res.status}): ${await res.text()}`)
  }
  return res.json()
}

export function exchangeCode(code: string) {
  return postToken({ code, grant_type: 'authorization_code' })
}

export function refresh(refreshToken: string) {
  return postToken({ refresh_token: refreshToken, grant_type: 'refresh_token' })
}

/**
 * Every activity started after `afterEpoch`, following pagination.
 *
 * Strava allows 100 non-upload requests per 15 minutes and 1,000 per day, so
 * this pulls the maximum 200 per page and stops at `maxPages` rather than
 * looping without bound on an account with a long history.
 */
export async function listActivities(
  accessToken: string,
  afterEpoch: number,
  maxPages = 10,
): Promise<StravaActivity[]> {
  const all: StravaActivity[] = []

  for (let page = 1; page <= maxPages; page++) {
    const url = new URL(`${STRAVA_API}/athlete/activities`)
    url.searchParams.set('after', String(afterEpoch))
    url.searchParams.set('per_page', '200')
    url.searchParams.set('page', String(page))

    const res = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      throw new Error(`Strava activities request failed (${res.status}): ${await res.text()}`)
    }

    const batch: StravaActivity[] = await res.json()
    all.push(...batch)
    if (batch.length < 200) break // last page
  }

  return all
}
