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
| 1 | Supabase schema, Google login | next |
| 2 | Strava connection and activity sync | |
| 3 | Land-first world route generation | |
| 4 | Journey map and progress (v1) | |
| 5 | Goals, streaks, group journeys | |

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
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from repository *variables*
(Settings → Secrets and variables → Actions → Variables).

## Route data

The world route is generated once, offline, by `scripts/build-route.ts` against
OpenRouteService and committed as a seed migration — the app never calls a
routing API at runtime. Each leg is routed with `avoid_features: ["ferries"]`
first; a sea crossing only appears where no land route exists, and is labelled
as such.

## Attribution

Activity data from Strava. Map tiles © OpenFreeMap contributors, data ©
OpenStreetMap contributors. Routing by OpenRouteService.
