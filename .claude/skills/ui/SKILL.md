---
name: ui
description: Improve the UI of this app, and verify the change by actually looking at it. Use when asked to make the interface better, prettier, sportier, more readable, or to change layout, spacing, colour, typography, or any screen's design. Also use before shipping any visual change.
allowed-tools: Bash(node .claude/skills/ui/screenshot.mjs *) Bash(npm run build) Read Edit Write Glob Grep
---

# Improving this app's UI

The rule that matters: **look at the change before claiming it works.** Three
separate UI bugs shipped here because they were reasoned about rather than
rendered — a map in a zero-height container, a Sync button under the zoom
control, a stats card running off the bottom of the screen. Each was obvious in
a screenshot and invisible in the source.

## The loop

1. Read `design-language.md` in this skill's directory. Match what exists rather
   than inventing a parallel style.
2. Make the change.
3. `npm run build`
4. Serve the build at the right base path — the app is hard-wired to
   `/RoundTheWorld/`, so serving `dist` at the web root gives a blank 404:

   ```sh
   mkdir -p /tmp/ui-preview && ln -sfn "$PWD/dist" /tmp/ui-preview/RoundTheWorld
   (cd /tmp/ui-preview && python3 -m http.server 8901 &)
   ```

5. Screenshot it at phone and desktop widths and **actually read the images**:

   ```sh
   node .claude/skills/ui/screenshot.mjs "http://localhost:8901/RoundTheWorld/?mapcheck=ui" /tmp/ui-phone.png 430 930
   node .claude/skills/ui/screenshot.mjs "http://localhost:8901/RoundTheWorld/?mapcheck=ui" /tmp/ui-wide.png 1280 900
   ```

   The script reports horizontal overflow, elements clipped outside the
   viewport, and console errors alongside the image. Treat a non-empty
   `clipped` list as a bug, not noise — map markers and controls are already
   excluded, so what remains is real.

   One console error is expected in preview: a `401` from the Strava status
   call, because the fixture has no session. Anything else is worth reading.

6. Fix what the screenshot shows. Repeat until it looks right at both widths.
7. Only then commit and deploy.

## Reaching screens that need a session

Most screens sit behind Google auth and a Strava connection, which cannot be
driven headlessly. `src/routes/MapCheck.tsx` renders real components against a
fixture instead:

- `?mapcheck` — map diagnostics: element sizes, canvas dimensions, whether
  MapLibre's stylesheet applied, WebGL availability.
- `?mapcheck=ui` — the real journey screen with a fixture journey.

If you are changing a screen with no preview route, add one to `MapCheck.tsx`
before starting. A screen you cannot photograph is a screen you cannot check.

## What to check in every screenshot

- **Overflow.** Nothing clipped at the right edge; no horizontal scroll.
- **Collisions.** Floating controls versus map controls, notches, safe areas.
- **Bottom of the screen.** Cards must clear MapLibre's attribution strip,
  which the OpenStreetMap licence requires stay visible. Never hide it.
- **Contrast.** Text sits on a dark translucent card over a *dark* map. Check
  it survives both a dark ocean and a pale city centre.
- **Tap targets.** Minimum ~40px for anything touchable.
- **Empty and extreme states.** Zero distance, a completed journey, a
  16-character city name, a five-digit kilometre figure.

## Traps specific to this app

- **MapLibre overrides Tailwind.** MapLibre adds `maplibregl-map` to the map
  container and its stylesheet loads after Tailwind's. Equal specificity means
  source order wins, so `.maplibregl-map { position: relative }` beats
  `.absolute`. The container is positioned by inline style for exactly this
  reason — do not "tidy" it into a class.
- **Percentage heights collapse.** `h-full` inside a flex item sized by
  `flex-1` + `min-height` resolves against `height: auto` and becomes zero. Use
  absolute positioning, or give the parent a definite height.
- **The map is the page.** Cards float over it with the `glass` utility. Do not
  reintroduce borders around the map or panels that push it into a box.
- **Colour carries meaning.** Green is distance covered, amber is distance
  still to go. Do not reuse either for anything else.
