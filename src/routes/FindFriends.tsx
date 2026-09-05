import { useEffect, useRef, useState } from 'react'
import Avatar from '../components/Avatar'
import { searchUsers, sendFriendRequest, type SearchResult } from '../lib/social'

export default function FindFriends({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(0)

  // Debounced so typing a name is a couple of queries, not one per key.
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    const ticket = ++latest.current
    const timer = setTimeout(async () => {
      setBusy(true)
      setError(null)
      try {
        const found = await searchUsers(query)
        if (ticket === latest.current) setResults(found)
      } catch (err) {
        if (ticket === latest.current) {
          setError(err instanceof Error ? err.message : 'Search failed')
        }
      } finally {
        if (ticket === latest.current) setBusy(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  async function add(user: SearchResult) {
    setSent((s) => new Set(s).add(user.id))
    try {
      await sendFriendRequest(user.id)
    } catch (err) {
      setSent((s) => {
        const next = new Set(s)
        next.delete(user.id)
        return next
      })
      setError(err instanceof Error ? err.message : 'Could not send that request')
    }
  }

  function label(user: SearchResult) {
    if (sent.has(user.id)) return 'Requested'
    if (user.friendship === 'accepted') return 'Friends'
    if (user.friendship === 'pending') {
      return user.direction === 'outgoing' ? 'Requested' : 'Accept'
    }
    return 'Add'
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 px-4 py-6">
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
        <h1 className="font-semibold tracking-tight text-white">Find friends</h1>
      </header>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or @handle"
        autoComplete="off"
        className="w-full rounded-2xl border border-white/15 bg-ink-soft px-4 py-3 text-sm text-white placeholder:text-slate-500"
      />

      {error && (
        <p role="alert" className="glass px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}
      {busy && <p className="px-1 text-xs text-slate-500">Searching…</p>}

      {!busy && query.trim().length >= 2 && results.length === 0 && (
        <p className="glass px-4 py-5 text-center text-sm text-slate-400">
          Nobody matching “{query}”.
        </p>
      )}

      <ul className="space-y-2">
        {results.map((user) => {
          const text = label(user)
          const done = text === 'Friends' || text === 'Requested'
          return (
            <li key={user.id} className="glass flex items-center gap-3 px-4 py-3">
              <Avatar name={user.display_name} url={user.avatar_url} size={38} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-white">{user.display_name}</div>
                <div className="truncate text-xs text-slate-500">@{user.handle}</div>
              </div>
              <button
                type="button"
                onClick={() => void add(user)}
                disabled={done}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  done
                    ? 'text-slate-500'
                    : 'bg-route text-ink hover:brightness-110'
                }`}
              >
                {text}
              </button>
            </li>
          )
        })}
      </ul>

      <p className="px-1 text-[11px] text-slate-500">
        People are found by name or handle. Email addresses are never searchable.
      </p>
    </main>
  )
}
