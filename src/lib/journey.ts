import { supabase } from './supabase'

export type Journey = {
  journey_id: string
  route_name: string
  activities_from: string
  travelled_m: number
  total_distance_m: number
  start_offset_m: number
  laps: number
  route_offset_m: number
  position: { lon: number; lat: number }
  segment: { mode: 'road' | 'ferry' | 'sea'; reason: string | null } | null
  passed: { name: string; country: string; behind_m: number } | null
  next: { name: string; country: string; ahead_m: number } | null
}

/** null when the user has not started a journey yet. */
export async function fetchJourney(): Promise<Journey | null> {
  const { data, error } = await supabase.rpc('my_journey')
  if (error) throw error
  return (data as Journey | null) ?? null
}

export async function startJourney(opts: {
  from: string
  lon?: number
  lat?: number
}): Promise<string> {
  const { data, error } = await supabase.rpc('start_journey', {
    p_route_slug: 'world',
    p_from: opts.from,
    p_lon: opts.lon ?? null,
    p_lat: opts.lat ?? null,
  })
  if (error) throw error
  return data as string
}

/** Browser geolocation, or null if unavailable or refused. */
export function currentPosition(): Promise<{ lon: number; lat: number } | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null)
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lon: p.coords.longitude, lat: p.coords.latitude }),
      () => resolve(null),
      { timeout: 10_000, maximumAge: 300_000 },
    )
  })
}

export const formatKm = (m: number) =>
  m >= 1_000_000
    ? `${Math.round(m / 1000).toLocaleString()} km`
    : `${(m / 1000).toFixed(1)} km`
