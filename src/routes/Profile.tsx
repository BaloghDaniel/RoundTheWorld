import { useCallback, useEffect, useRef, useState } from 'react'
import Avatar from '../components/Avatar'
import { useAuth } from '../lib/auth'
import {
  fetchFriends,
  fetchMyProfile,
  removeFriend,
  respondToFriendRequest,
  updateProfile,
  uploadAvatar,
  type Friend,
  type Profile as ProfileRow,
} from '../lib/social'

type Props = { onBack: () => void; onFindFriends: () => void }

// Achievements are not implemented yet. Showing the shape of what is coming is
// more honest than an empty page, and locked tiles say plainly that nothing
// here is earned yet.
const PLANNED_BADGES = [
  { name: 'First 100 km', hint: 'Cover your first 100 km' },
  { name: 'Border crossing', hint: 'Pass into a second country' },
  { name: 'Continental', hint: 'Finish a stage end to end' },
  { name: 'Streak of ten', hint: 'Log activity ten days running' },
]

export default function Profile({ onBack, onFindFriends }: Props) {
  const { user, signOut } = useAuth()
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [friends, setFriends] = useState<Friend[]>([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const [p, f] = await Promise.all([fetchMyProfile(), fetchFriends()])
      setProfile(p)
      setName(p?.display_name ?? '')
      setFriends(f)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your profile')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy('avatar')
    setError(null)
    try {
      const url = await uploadAvatar(file)
      setProfile((p) => (p ? { ...p, avatar_url: url } : p))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(null)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function saveName() {
    if (!name.trim() || name === profile?.display_name) return
    setBusy('name')
    try {
      await updateProfile({ display_name: name.trim() })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(null)
    }
  }

  const accepted = friends.filter((f) => f.status === 'accepted')
  const incoming = friends.filter((f) => f.status === 'pending' && f.direction === 'incoming')
  const outgoing = friends.filter((f) => f.status === 'pending' && f.direction === 'outgoing')

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-5 px-4 py-6">
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="glass grid size-9 place-items-center text-slate-200 transition hover:bg-white/10"
        >
          <svg viewBox="0 0 24 24" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18 9 12l6-6" />
          </svg>
        </button>
        <h1 className="font-semibold tracking-tight text-white">Profile</h1>
        <button
          type="button"
          onClick={() => void signOut()}
          className="ml-auto rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/5"
        >
          Sign out
        </button>
      </header>

      {error && (
        <p role="alert" className="glass px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      <section className="glass flex items-center gap-4 px-4 py-4">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy === 'avatar'}
          className="relative rounded-full transition hover:opacity-80 disabled:opacity-50"
          aria-label="Change avatar"
        >
          <Avatar name={profile?.display_name} url={profile?.avatar_url} size={64} />
          <span className="absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-full bg-route text-ink">
            <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={onPickAvatar}
          className="hidden"
        />

        <div className="min-w-0 flex-1 space-y-1.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void saveName()}
            placeholder="Your name"
            className="w-full rounded-lg bg-ink-soft px-3 py-2 text-sm font-semibold text-white"
          />
          <div className="text-xs text-slate-500">
            @{profile?.handle ?? '…'} · {user?.email}
          </div>
          {busy === 'avatar' && <div className="text-xs text-slate-400">Uploading…</div>}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="eyebrow px-1">Badges</h2>
        <div className="glass grid grid-cols-2 gap-3 px-4 py-4 sm:grid-cols-4">
          {PLANNED_BADGES.map((b) => (
            <div key={b.name} className="text-center opacity-40">
              <div className="mx-auto grid size-12 place-items-center rounded-full bg-white/5 ring-1 ring-white/10">
                <svg viewBox="0 0 24 24" className="size-5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <rect x="5" y="11" width="14" height="9" rx="2" />
                  <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                </svg>
              </div>
              <div className="mt-1.5 text-[11px] font-medium text-slate-300">{b.name}</div>
              <div className="text-[10px] leading-tight text-slate-500">{b.hint}</div>
            </div>
          ))}
        </div>
        <p className="px-1 text-[11px] text-slate-500">
          Not earned yet — achievements are still to be built.
        </p>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="eyebrow">Friends</h2>
          <button
            type="button"
            onClick={onFindFriends}
            className="text-xs font-medium text-route underline underline-offset-2"
          >
            Find friends
          </button>
        </div>

        {incoming.length > 0 && (
          <ul className="space-y-2">
            {incoming.map((f) => (
              <li key={f.friendship_id} className="glass flex items-center gap-3 px-4 py-3">
                <Avatar name={f.display_name} url={f.avatar_url} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-white">{f.display_name}</div>
                  <div className="text-xs text-slate-500">wants to be friends</div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await respondToFriendRequest(f.friendship_id, true)
                    await load()
                  }}
                  className="rounded-lg bg-route px-3 py-1.5 text-xs font-bold text-ink"
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await respondToFriendRequest(f.friendship_id, false)
                    await load()
                  }}
                  className="text-xs text-slate-500 hover:text-slate-300"
                >
                  Ignore
                </button>
              </li>
            ))}
          </ul>
        )}

        {accepted.length === 0 && incoming.length === 0 && outgoing.length === 0 ? (
          <p className="glass px-4 py-5 text-center text-sm text-slate-400">
            No friends yet. Find someone to run with.
          </p>
        ) : (
          <ul className="space-y-2">
            {accepted.map((f) => (
              <li key={f.id} className="glass flex items-center gap-3 px-4 py-3">
                <Avatar name={f.display_name} url={f.avatar_url} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-white">{f.display_name}</div>
                  <div className="truncate text-xs text-slate-500">@{f.handle}</div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await removeFriend(f.id)
                    await load()
                  }}
                  className="text-xs text-slate-500 transition hover:text-red-400"
                >
                  Remove
                </button>
              </li>
            ))}
            {outgoing.map((f) => (
              <li key={f.friendship_id} className="glass flex items-center gap-3 px-4 py-3 opacity-60">
                <Avatar name={f.display_name} url={f.avatar_url} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-white">{f.display_name}</div>
                  <div className="text-xs text-slate-500">request sent</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
