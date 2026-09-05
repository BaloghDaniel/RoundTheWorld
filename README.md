# RoundTheWorld

A PWA that lays your Strava runs and rides end to end along a real road route
around the world, so you can watch yourself cross continents one activity at a
time.

You never have to run the route itself. Strava reports a distance per activity;
those distances are summed and projected onto the route geometry. Ten kilometres
round your local park moves you ten kilometres down the road towards Madrid.

## Status

| Phase | Scope | State |
| ----- | ----- | ----- |
| 0 | Repo, PWA shell, Pages deploy pipeline | done |
| 1 | Supabase schema, Google login | done |
| 2 | Strava connection and activity sync | done |
| 3 | Land-first world route generation | done |
| 4 | Journey map and progress (v1) | done |
| 5 | City-to-city goals, multiple journeys | done |
| 6 | Profiles, friends, Tag Along group mode | done |
| 7 | Race and Scramble modes, badges | next |

## Stack

React 19 + Vite + TypeScript, Tailwind v4, `vite-plugin-pwa`, MapLibre GL with
OpenFreeMap tiles, Supabase (Postgres + PostGIS, Auth, Edge Functions), deployed
to GitHub Pages by Actions on push to `master`.

Privileged work — the Strava token exchange and the activity sync — runs in
Supabase Edge Functions, because GitHub Pages is static and cannot hold a
client secret.

## Develop

```sh
npm install
cp .env.example .env.local   # fill in once the Supabase project exists
npm run dev
```

The app is served under the `/RoundTheWorld/` base path in every environment so
that development matches the Pages deployment.

## Icons

`assets/icon.svg` is the source. After editing it:

```sh
./scripts/generate-icons.sh
```

## Deploying

Pushing to `master` builds and publishes to GitHub Pages. The build reads
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from repository *variables*
(Settings → Secrets and variables → Actions → Variables).

## The route

The route is generated once, offline, and committed — the app never calls a
routing API at runtime. Each stage is requested with `avoid_features:
["ferries"]` first, so a crossing only appears where no land route exists.
Declared crossings are not taken on trust: the build still asks for a road
route across each one and only draws a sea arc after routing actually fails.

64,381 km, 13 segments. All nine road stages routed with ferries forbidden and
succeeded, so the route uses no ferry anywhere. Four sea crossings remain, three
of them confirmed by routing genuinely failing:

| Crossing | Distance | Basis |
| --- | --- | --- |
| Singapore → Darwin | 3,355 km | confirmed no road |
| Sydney → Santiago | 11,346 km | beyond ORS's 6,000 km limit, untested |
| Turbo → Panama City | 322 km | confirmed no road — the Darién Gap |
| Halifax → Lisbon | 4,483 km | confirmed no road |

Regenerate and reseed with:

```sh
node --env-file=.env.local scripts/build-route.ts    # routes it, writes data/
node scripts/emit-route-asset.ts                     # public/routes/world.json
node --env-file=.env.local scripts/seed-route.ts     # into Supabase
```

## Attribution

Activity data from Strava. Map tiles © OpenFreeMap contributors, data ©
OpenStreetMap contributors. Routing by OpenRouteService.
