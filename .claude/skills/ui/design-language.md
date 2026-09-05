# Design language

White in light mode, black in dark, and one loud accent carrying every action.
Closer to a sports watch than a dashboard. On a journey screen the map is the
page and everything else floats above it.

## Theme

Colours are CSS variables on `:root` in `src/index.css`, flipped by
`prefers-color-scheme` and overridden by `data-theme="light" | "dark"`. Tailwind
utilities point at them through `@theme inline`, so `bg-surface` and `text-ink`
follow the theme automatically. Never hardcode a hex in a component.

`src/lib/theme.ts` owns the choice (`system` by default) and persists it.
`index.html` applies a stored choice before first paint, so a dark-mode user
never sees a white flash.

| Token | Light | Dark | Meaning |
| --- | --- | --- | --- |
| `canvas` | `#ffffff` | `#000000` | The page |
| `surface` | `#ffffff` | `#0b0b0c` | Cards |
| `raised` | `#f4f4f5` | `#18181b` | Inputs, hover, tracks |
| `ink` | `#09090b` | `#fafafa` | Primary text |
| `muted` | `#71717a` | `#a1a1aa` | Secondary text |
| `hair` | 12% black | 14% white | Borders |
| `accent` | `#ff2d55` | `#ff375f` | Every primary action |
| `danger` | `#b91c1c` | `#fca5a5` | Errors only |
| `done` | `#16a34a` | `#22c55e` | Distance covered |
| `ahead` | `#f59e0b` | `#fbbf24` | Distance remaining |

`done` and `ahead` are the two route colours on the map and the two ends of
every progress reading. They mean progress, never brand — a progress bar's
filled portion is distance *covered*, so it is `done`, never `ahead`.

The accent is the loud one and belongs to actions and live figures. Errors use
`danger`, which is deliberately a different red so a mistake never looks like a
button.

## Brand colours are not themeable

Strava orange (`#FC4C02`) and the white Google button carry their own fixed
foreground — `text-white` and `text-zinc-900`. Running a theme token through
them turns the label invisible in one mode.

## Utilities

- `card` — solid panel, for pages that are not over the map.
- `glass` — translucent, blurred, for panels floating on the map.
- `eyebrow` — 10px all-caps label. Always **above** the thing it labels.
- `readout` — the figure: extrabold, `tabular-nums` so digits do not jitter.
- `btn-accent` — primary pill. `btn-quiet` — secondary outline.
- `field` — text input.
- `screen` — the fade every top-level `<main>` carries, so moving between
  screens reads as continuous. Disabled under `prefers-reduced-motion`.

## Typography

`eyebrow` above `readout` is the core unit; reach for it before inventing
another way to present a number. Headline distance `text-4xl`, stat grid
`text-lg`, prose `text-sm text-muted` with `text-pretty` beyond one line.

## Voice

Short and factual: "412.0 km", "3,282 km to go", "at this pace". No exclamation
marks. The one place warmth belongs is arrival: "You made it."
