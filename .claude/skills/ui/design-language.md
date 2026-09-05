# Design language

Dark, high-contrast, closer to a sports watch than a dashboard. The map is the
page; everything else floats above it.

## Tokens

Defined in `src/index.css` under `@theme`:

| Token | Value | Meaning |
| --- | --- | --- |
| `ink` | `#0b1120` | Page and card ground |
| `ink-soft` | `#131c31` | Raised surface, inputs |
| `route` | `#38bdf8` | Primary action |
| `marker` | `#fbbf24` | Lap badge, current position |
| `done` | `#22c55e` | Distance covered |
| `ahead` | `#eab308` | Distance still to go |

`done` and `ahead` are also the two route colours on the map. They mean
progress and remaining, nowhere else.

## Utilities

- `glass` — floating panel: rounded-2xl, translucent `ink`, blurred, lifted by
  a shadow rather than outlined by a border.
- `eyebrow` — 10px all-caps label with wide tracking, above a figure.
- `readout` — the figure itself: semibold, `tabular-nums` so digits do not
  jitter as numbers change.

The `eyebrow` + `readout` pair is the core unit. Reach for it before inventing
another way to present a number.

## Typography

- Labels: `eyebrow`.
- Figures: `readout`, sized to importance — `text-3xl` for the headline
  distance, `text-lg` in the stat grid.
- Prose: `text-sm text-slate-400`, `text-pretty` for anything over one line.
- Hints under a figure: `text-[11px] text-slate-500`.

## Layout

- Map fills the viewport; `glass` cards float at top and bottom with `p-3`.
- Bottom stack scrolls if tall (`max-h-[68dvh] overflow-y-auto`) rather than
  running off the screen.
- Lists use `space-y-3` between `glass` cards, not dividers.
- Buttons: primary is `rounded-2xl bg-route`, bold, uppercase, wide tracking.

## Voice

Short and factual. "201.0 km", "3,282 km to go", "at this pace". Say what
happened; skip exclamation marks. The one place warmth is right is arrival:
"You made it."
