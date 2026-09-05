import { useEffect, useRef, useState } from 'react'
import { searchPlaces, type Place } from '../lib/goals'

type Props = {
  label: string
  value: Place | null
  onChange: (place: Place | null) => void
  placeholder?: string
  /** Shown when nothing is picked, e.g. "Using your current position". */
  emptyHint?: string
}

export default function PlaceSearch({ label, value, onChange, placeholder, emptyHint }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(0)

  // Debounced so typing a city name is a couple of requests, not one per key.
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
        const found = await searchPlaces(query)
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

  if (value) {
    return (
      <div className="space-y-2">
        <span className="text-sm font-medium text-slate-200">{label}</span>
        <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-ink-soft px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-white">{value.name}</div>
            {value.label && value.label !== value.name && (
              <div className="truncate text-xs text-slate-500">{value.label}</div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(null)
              setQuery('')
            }}
            className="shrink-0 text-xs text-slate-400 underline underline-offset-2 hover:text-slate-200"
          >
            Change
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <label className="block space-y-2">
        <span className="text-sm font-medium text-slate-200">{label}</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full rounded-xl border border-white/15 bg-ink-soft px-4 py-3 text-sm text-white placeholder:text-slate-500"
        />
      </label>

      {emptyHint && !query && <p className="text-xs text-slate-500">{emptyHint}</p>}
      {busy && <p className="text-xs text-slate-500">Searching…</p>}
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}

      {results.length > 0 && (
        <ul className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
          {results.map((place) => (
            <li key={`${place.lon},${place.lat},${place.label}`}>
              <button
                type="button"
                onClick={() => {
                  onChange(place)
                  setResults([])
                }}
                className="w-full bg-ink-soft px-4 py-2.5 text-left transition hover:bg-white/5"
              >
                <div className="text-sm text-white">{place.name}</div>
                <div className="truncate text-xs text-slate-500">{place.label}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
