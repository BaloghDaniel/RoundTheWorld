import { useCallback, useEffect, useState } from 'react'
import { deleteUser, fetchAdminUsers, type AdminUser } from '../lib/social'
import Avatar from './Avatar'

/** Admin-only user list. Rendered only when am_i_admin() is true, but the
 *  Edge Function checks admin status again on every call. */
export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setUsers(await fetchAdminUsers())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load users')
      setUsers([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function remove(user: AdminUser) {
    setBusy(user.id)
    setError(null)
    try {
      await deleteUser(user.id)
      setConfirming(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete that user')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="eyebrow">Admin · users</h2>
        {users && <span className="text-[11px] text-muted">{users.length}</span>}
      </div>

      {error && (
        <p role="alert" className="card px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {users === null ? (
        <p className="px-1 text-xs text-muted">Loading…</p>
      ) : (
        <ul className="space-y-2">
          {users.map((user) => (
            <li key={user.id} className="card px-4 py-3">
              <div className="flex items-center gap-3">
                <Avatar name={user.display_name} url={user.avatar_url} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-ink">
                      {user.display_name}
                    </span>
                    {user.is_admin && (
                      <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">
                        Admin
                      </span>
                    )}
                    {user.is_you && <span className="text-[11px] text-muted">you</span>}
                  </div>
                  <div className="truncate text-[11px] text-muted">{user.email}</div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    {user.journeys} journeys · {user.activities} activities ·{' '}
                    {user.strava_athlete_id ? `Strava ${user.strava_athlete_id}` : 'no Strava'}
                  </div>
                </div>

                {!user.is_you && (
                  <button
                    type="button"
                    onClick={() =>
                      confirming === user.id ? void remove(user) : setConfirming(user.id)
                    }
                    disabled={busy === user.id}
                    className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${
                      confirming === user.id
                        ? 'bg-danger text-white'
                        : 'text-muted hover:text-danger'
                    }`}
                  >
                    {busy === user.id
                      ? 'Deleting…'
                      : confirming === user.id
                        ? 'Confirm'
                        : 'Delete'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="px-1 text-[11px] text-muted">
        Deleting a user removes their journeys, activities and friendships, and
        releases their Strava authorisation so it stops counting against the
        app's athlete limit.
      </p>
    </section>
  )
}
