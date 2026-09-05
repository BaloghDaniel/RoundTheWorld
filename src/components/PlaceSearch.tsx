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
        <span className="text-sm font-medium text-ink">{label}</span>
        <div className="flex items-center gap-3 rounded-xl border border-hair bg-raised px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-ink">{value.name}</div>
            {value.label && value.label !== value.name && (
              <div className="truncate text-xs text-muted">{value.label}</div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(null)
              setQuery('')
            }}
            className="shrink-0 text-xs text-muted underline underline-offset-2 hover:text-ink"
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
        <span className="text-sm font-medium text-ink">{label}</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full rounded-xl border border-hair bg-raised px-4 py-3 text-sm text-ink placeholder:text-muted"
        />
      </label>

      {emptyHint && !query && <p className="text-xs text-muted">{emptyHint}</p>}
      {busy && <p className="text-xs text-muted">Searching…</p>}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}

      {results.length > 0 && (
        <ul className="divide-y divide-hair overflow-hidden rounded-xl border border-hair">
          {results.map((place) => (
            <li key={`${place.lon},${place.lat},${place.label}`}>
              <button
                type="button"
                onClick={() => {
                  onChange(place)
                  setResults([])
                }}
                className="w-full bg-raised px-4 py-2.5 text-left transition hover:bg-raised"
              >
                <div className="text-sm text-ink">{place.name}</div>
                <div className="truncate text-xs text-muted">{place.label}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
