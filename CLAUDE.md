# RoundTheWorld — working notes

A PWA that lays a runner's Strava distance end to end along real road routes.
Distance is scalar: running 10 km round a local park advances you 10 km down
the road to Madrid. Activity GPS tracks are never fetched or stored.

Live: https://baloghdaniel.github.io/RoundTheWorld/
Repo: BaloghDaniel/RoundTheWorld · Supabase project `vdtnjwztjsnolpnetqyx` (eu-north-1)

## Shape of the system

```
GitHub Pages (static)          Supabase                     Third parties
├─ React 19 + Vite + TS        ├─ Postgres + PostGIS         ├─ Strava  (activities)
├─ Tailwind v4                 ├─ Auth (Google)              ├─ OpenRouteService
├─ MapLibre GL                 ├─ Storage (avatars)          │    (routing + geocoding)
└─ public/routes/world.json    └─ Edge Functions (Deno)      └─ OpenFreeMap (tiles)
```

**Pages is static, so anything holding a secret lives in an Edge Function.**
That single constraint explains most of the architecture: the Strava token
exchange, the activity sync, routing and geocoding all run server-side because
they need `STRAVA_CLIENT_SECRET` or `ORS_API_KEY`.

Deploys run on push to `master` (`.github/workflows/deploy.yml`). The build
reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from repository
*variables*, not secrets — both are public by design.

## Where the secrets live

Nothing sensitive is in the repo. Values live in exactly one place each:

| Secret | Home |
| --- | --- |
| `STRAVA_CLIENT_ID` / `_SECRET` / `_STATE_SECRET` | Supabase → Edge Function secrets |
| `ORS_API_KEY` | Supabase Edge Function secrets **and** local `.env.local` (build scripts) |
| `SUPABASE_SECRET_KEY` | local `.env.local` only — bypasses all RLS |
| Google OAuth client | Supabase → Auth → Providers |

`.env.local` is gitignored and holds the local half. `.env.example` documents
the names.

## Data model

- **`routes`** — geometry plus `is_loop`. The world route is a closed loop that
  wraps and counts laps; a goal route clamps at its destination and reports
  completion. `route_segments` carry `mode` (`road` / `ferry` / `sea`), a
  `reason`, and cumulative distances. `route_landmarks` are the milestones.
- **`journeys`** — one per user per route, each with its own `activities_from`
  date. That date is the persistence the whole app hangs on: it decides which
  activities count, and two journeys on the same route with different dates
  legitimately show different distances.
- **`activities`** — distance, type, date. Written only by the sync function.
- **`strava_connections`** — RLS enabled with *no policies*, deliberately. Only
  Edge Functions using the service role can read tokens. The browser learns
  connection state through `my_strava_status()`.
- **`friendships`**, **`journey_groups`**, **`journey_group_members`** — social
  and group play.

RPCs are the API surface; the client rarely touches tables directly. Definer
functions are used where a policy alone cannot express the rule, and each one
reads `auth.uid()` itself rather than taking a user id — an earlier version
took arbitrary ids and let anyone probe whether two strangers were friends.

## Decisions that are not obvious from the code

Each of these was a bug first. Changing them without understanding why will
reintroduce the bug.

- **Land-first routing.** Every leg is requested from ORS with
  `avoid_features: ["ferries"]`. A ferry is allowed only when that fails. The
  world route's four sea crossings are *declared* in `scripts/world-route.ts`
  but not trusted: the build still asks for a road route across each and only
  draws a sea arc after routing actually fails. Three of the four are confirmed
  that way; Sydney→Santiago is logged as unverifiable because at 11,346 km it
  exceeds ORS's 6,000 km limit, so no check ever ran. Do not upgrade that to
  "confirmed".
- **Interpolation walks vertices in true metres.** `route_point_at` used
  `ST_LineInterpolatePoint`, which walks a fraction of a line measured in
  *degrees*. A degree of longitude is 111 km at the equator and 57 km at
  Stockholm, so over a 4,000 km segment the marker landed up to 279 km from
  where its distance said. `src/lib/route.ts` mirrors the same walk client-side;
  the two agree within 1 km and must stay in step.
- **Antimeridian seams.** The Pacific crossing steps 179.49°E → 178.19°W: 1.3°
  on the globe, 357.69° as stored. The generator inserts a vertex exactly on
  the date line so every pair is short; the renderer splits lines at that seam
  because the resulting `180 → -180` pair is zero distance on the globe but a
  full sweep of the map.
- **The MapLibre worker must be shipped.** MapLibre builds its worker URL at
  runtime, which Vite cannot analyse, so it is never emitted and 404s. Vector
  tiles are parsed in that worker: without it the style, TileJSON and sprites
  all load 200, the canvas is sized correctly, and the map renders *white* with
  no tile requests and no errors. `prebuild` copies it into `public/`.
- **The map container is positioned by inline style.** MapLibre puts
  `maplibregl-map` on it, and that rule sets `position: relative`. Its
  stylesheet loads after Tailwind's, and both selectors are one class, so source
  order wins and `.absolute` loses — leaving a zero-height container and an
  invisible map. Do not "tidy" the inline style into a class.
- **Tag Along banks, never discards.** Nobody's shown position may get more than
  `max_gap_m` (100 km) ahead of the runner furthest back. The leader's extra
  distance stays in `raw_m` and reappears when the party closes up.
- **Colour carries meaning.** Green is covered, amber is remaining, the accent
  is for actions, `danger` is for errors. A progress bar's filled portion is
  covered distance, so it is green. Brand colours (Strava orange, the Google
  button) keep fixed foregrounds — a theme token makes their labels vanish in
  one mode.

## Third-party limits worth remembering

- **Strava caps the whole application**, not each user. Currently on the
  10-athlete Standard Tier; beyond that needs Strava's app review. Rate limit is
  100 non-upload requests / 15 min, which is why sync is debounced to 15
  minutes. Disconnecting must delete the tokens *and* the activities — their
  terms.
- **The Standard Tier requires an active Strava subscription on the account
  that owns the app.** Without one Strava deactivates the whole application and
  returns 403 `{"code":"inactive"}` on every call, for every athlete. OAuth
  still succeeds, so accounts appear connected and only syncing fails —
  which reads like a per-user problem and is not. `classify403` in
  `_shared/strava.ts` turns this into a 503 with `reason: 'app_inactive'`
  rather than a raw 502.
- **ORS** refuses any single request over 6,000 km or 50 waypoints.
  `routeWaypoints` halves an oversized stage and stitches the halves.
  Error 2009 = no route, 2010 = a waypoint is not near a road, 2004 = too long.
  They are different facts and the code keeps them apart.
- **OpenFreeMap** needs no key. Its attribution must stay visible — licence.

## Regenerating the world route

A one-off. The output is committed; the app never calls a routing API for it.

```sh
node --env-file=.env.local scripts/build-route.ts   # routes it → data/routes/world.json
node scripts/emit-route-asset.ts                    # → public/routes/world.json
node --env-file=.env.local scripts/seed-route.ts    # → Supabase, in place
```

ORS responses are cached in `.ors-cache`, so fixing one waypoint does not
re-request the stages that already worked. Seeding **updates in place**: a
delete would be refused by the foreign key from `journeys`, correctly, since it
would otherwise move everyone who had started.

## How to verify things

Do not claim a change works without evidence. Three fixes shipped broken here
because they were reasoned about rather than run.

- **UI:** follow `.claude/skills/ui/SKILL.md` — build, serve at the
  `/RoundTheWorld/` base path, screenshot at 430 and 1280 wide in *both*
  themes, read the image. `?mapcheck` reports element sizes, canvas dimensions
  and whether MapLibre's stylesheet applied; `?mapcheck=ui` renders the real
  journey screen against a fixture.
- **Backend:** write a throwaway-user script. Create users with the secret key,
  sign in for a real JWT, exercise the RPCs and Edge Functions as that user,
  then delete the users — everything cascades. That is how the Tag Along leash,
  the friendship flow and the storage policies were checked.
- **Signed-in screens:** inject a session by setting
  `localStorage['sb-vdtnjwztjsnolpnetqyx-auth-token']` through
  `Page.addScriptToEvaluateOnNewDocument` before navigating.
- **After deploying,** wait for the run matching *this commit's* SHA. Matching
  on "the latest run" once read a stale deployment and produced a wrong
  conclusion.
- Run `get_advisors` after schema changes.

## State

Done: PWA shell and Pages pipeline · Google auth · Strava connect and sync ·
the 64,381 km world route · journey map and progress · city-to-city goals ·
multiple journeys · profiles, avatars and friends · Tag Along.

Next, in the order discussed: **Race** (first to the destination) and
**Scramble** (combined distance, golf-scramble style) — both already in the
`journey_groups.mode` enum, with `group_state` falling back to raw distance, so
they are that function plus UI rather than a schema change. Then badges and
achievements, whose slots are already laid out on the profile as locked tiles.

Loose ends: the Supabase secret key was pasted into a chat and should be
rotated; email/password signup is still enabled although the app is Google-only.
