import { supabase } from './supabase'

export type Profile = {
  id: string
  display_name: string | null
  handle: string | null
  avatar_url: string | null
}

export type SearchResult = Profile & {
  friendship: 'none' | 'pending' | 'accepted' | 'declined'
  direction: 'incoming' | 'outgoing' | null
}

export type Friend = Profile & {
  status: 'pending' | 'accepted'
  direction: 'incoming' | 'outgoing'
  friendship_id: string
}

export type GroupInvite = {
  group_id: string
  mode: 'tag_along' | 'race' | 'scramble'
  max_gap_m: number
  route_name: string
  origin_name: string | null
  destination_name: string | null
  total_distance_m: number
  is_loop: boolean
  invited_by_name: string | null
  invited_by_avatar: string | null
}

export type Runner = {
  user_id: string
  journey_id: string
  display_name: string | null
  handle: string | null
  avatar_url: string | null
  travelled_m: number
  /** What they have actually run. */
  raw_m: number
  /** Where they are shown, after any Tag Along hold-back. */
  effective_m: number
  waiting: boolean
  held_back_m: number
  position: { lon: number; lat: number }
}

export type GroupState = {
  group_id: string
  mode: 'tag_along' | 'race' | 'scramble'
  max_gap_m: number
  slowest_m: number
  runners: Runner[]
}

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw error
  return data as T
}

export const fetchMyProfile = () => rpc<Profile>('my_profile')
export const amIAdmin = () => rpc<boolean>('am_i_admin')
export const searchUsers = (q: string) => rpc<SearchResult[]>('search_users', { p_query: q })
export const fetchFriends = () => rpc<Friend[]>('my_friends')
export const sendFriendRequest = (id: string) => rpc<void>('send_friend_request', { p_user_id: id })
export const removeFriend = (id: string) => rpc<void>('remove_friend', { p_user_id: id })
export const respondToFriendRequest = (friendshipId: string, accept: boolean) =>
  rpc<void>('respond_to_friend_request', { p_friendship_id: friendshipId, p_accept: accept })

export const fetchGroupInvites = () => rpc<GroupInvite[]>('my_group_invites')
export const fetchGroupState = (groupId: string) =>
  rpc<GroupState | null>('group_state', { p_group_id: groupId })

export const respondToGroupInvite = (groupId: string, accept: boolean, from: string) =>
  rpc<string | null>('respond_to_group_invite', {
    p_group_id: groupId,
    p_accept: accept,
    p_from: from,
  })

export const startGroupJourney = (opts: {
  routeId: string
  from: string
  mode?: 'tag_along' | 'race' | 'scramble'
  invitees?: string[]
  maxGapM?: number
}) =>
  rpc<string>('start_group_journey', {
    p_route_id: opts.routeId,
    p_from: opts.from,
    p_mode: opts.mode ?? 'tag_along',
    p_invitees: opts.invitees ?? [],
    p_max_gap_m: opts.maxGapM ?? 100_000,
  })

export async function updateProfile(patch: {
  display_name?: string
  handle?: string
  avatar_url?: string
}) {
  const { data: session } = await supabase.auth.getSession()
  const id = session.session?.user.id
  if (!id) throw new Error('Not signed in')
  const { error } = await supabase.from('profiles').update(patch).eq('id', id)
  if (error) throw error
}

/**
 * Store an avatar and point the profile at it.
 *
 * Written under a folder named for the user id, which is what the storage
 * policy checks, so nobody can overwrite anyone else's picture.
 */
export async function uploadAvatar(file: File): Promise<string> {
  const { data: session } = await supabase.auth.getSession()
  const id = session.session?.user.id
  if (!id) throw new Error('Not signed in')

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
  // Cache-busting name: the public URL is stable per upload, so a new file
  // must not reuse an old one's path or browsers will show the stale image.
  const path = `${id}/${Date.now()}.${ext}`

  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, file, { contentType: file.type, upsert: true })
  if (error) throw error

  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  await updateProfile({ avatar_url: data.publicUrl })
  return data.publicUrl
}

export const initials = (name: string | null | undefined) =>
  (name ?? '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?'

// ------------------------------------------------------------------- admin

export type AdminUser = Profile & {
  email: string | null
  is_admin: boolean
  created_at: string
  last_sign_in_at: string | null
  strava_athlete_id: number | null
  strava_last_sync_at: string | null
  activities: number
  journeys: number
  is_you: boolean
}

async function adminFetch(init?: RequestInit) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Not signed in')
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json', ...init?.headers },
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'Request failed')
  return body
}

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  return (await adminFetch()).users
}

/**
 * Delete a user and everything of theirs.
 *
 * Releases their Strava authorisation first, so the athlete stops counting
 * against the app's connected-athlete limit; the rest cascades from auth.
 */
export async function deleteUser(userId: string): Promise<void> {
  await adminFetch({ method: 'POST', body: JSON.stringify({ user_id: userId }) })
}
