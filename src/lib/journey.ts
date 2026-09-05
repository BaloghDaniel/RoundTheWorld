import { supabase } from './supabase'

/** What the journeys list needs; a subset of the detail. */
export type JourneySummary = {
  journey_id: string
  route_id: string
  route_slug: string
  route_name: string
  is_loop: boolean
  completed: boolean
  origin_name: string | null
  destination_name: string | null
  activities_from: string
  travelled_m: number
  total_distance_m: number
  remaining_m: number
  laps: number
  created_at: string
}

export type Journey = {
  journey_id: string
  route_id: string
  route_slug: string
  route_name: string
  is_loop: boolean
  completed: boolean
  origin_name: string | null
  destination_name: string | null
  remaining_m: number
  pace_m_per_day: number
  /** Projected arrival at the current pace; null until there is any distance. */
  eta: string | null
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

/** Summary of every journey the user has, newest first. */
export async function fetchJourneys(): Promise<JourneySummary[]> {
  const { data, error } = await supabase.rpc('my_journeys')
  if (error) throw error
  return (data as JourneySummary[]) ?? []
}

/** Full detail for one journey, or null if it is gone. */
export async function fetchJourney(id: string): Promise<Journey | null> {
  const { data, error } = await supabase.rpc('journey_detail', { p_journey_id: id })
  if (error) throw error
  return (data as Journey | null) ?? null
}

export async function deleteJourney(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_journey', { p_journey_id: id })
  if (error) throw error
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
