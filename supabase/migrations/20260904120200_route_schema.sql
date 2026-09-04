-- Route geometry and per-user journeys along it.
--
-- Routes are generated offline by scripts/build-route.ts and seeded here; the
-- app never calls a routing API at runtime. A route is stored twice over: as
-- one whole line for drawing, and as ordered segments carrying cumulative
-- distance, which is what makes "where am I after 3,412 km?" a cheap lookup.

create table public.routes (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  name             text not null,
  kind             text not null check (kind in ('world', 'custom')),
  -- A land-only variant exists so a user who refuses sea crossings still has
  -- a coherent route rather than a broken one.
  allows_sea       boolean not null default true,
  total_distance_m double precision not null check (total_distance_m > 0),
  geom             geography (linestring, 4326) not null,
  owner_id         uuid references auth.users (id) on delete cascade,
  created_at       timestamptz not null default now()
);

create table public.route_segments (
  id           bigint generated always as identity primary key,
  route_id     uuid not null references public.routes (id) on delete cascade,
  seq          integer not null,
  -- 'ferry' is a real ferry on the road network; 'sea' is a crossing we had to
  -- invent because no land route exists at all. Both are drawn dashed, and
  -- `reason` explains to the user why the road ran out.
  mode         text not null check (mode in ('road', 'ferry', 'sea')),
  reason       text,
  distance_m   double precision not null check (distance_m >= 0),
  cum_start_m  double precision not null,
  cum_end_m    double precision not null,
  geom         geography (linestring, 4326) not null,
  unique (route_id, seq)
);

create index route_segments_lookup_idx
  on public.route_segments (route_id, cum_start_m);

create table public.route_landmarks (
  id       bigint generated always as identity primary key,
  route_id uuid not null references public.routes (id) on delete cascade,
  name     text not null,
  country  text,
  cum_m    double precision not null,
  geom     geography (point, 4326) not null
);

create index route_landmarks_lookup_idx
  on public.route_landmarks (route_id, cum_m);

create table public.journeys (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  route_id        uuid not null references public.routes (id) on delete restrict,
  -- Distance along the route where this user starts. The route is a fixed
  -- loop; picking a start point rotates it rather than regenerating it.
  start_offset_m  double precision not null default 0,
  activities_from date not null,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

-- One active journey per user keeps the home screen unambiguous.
create unique index journeys_one_active_per_user
  on public.journeys (user_id) where is_active;

-- --------------------------------------------------------------- functions

-- Point at a given distance along a route. Finds the segment holding that
-- distance, then interpolates inside it. Segments are short, so working in
-- degree space within one segment costs very little accuracy.
create function public.route_point_at(
  p_route_id uuid,
  p_offset_m double precision
)
returns geography
language sql
stable
set search_path = public, extensions
as $$
  select st_lineinterpolatepoint(
           s.geom::geometry,
           case
             when s.cum_end_m > s.cum_start_m then
               least(1, greatest(0,
                 (p_offset_m - s.cum_start_m) / (s.cum_end_m - s.cum_start_m)))
             else 0
           end
         )::geography
  from public.route_segments s
  where s.route_id = p_route_id
    and p_offset_m >= s.cum_start_m
  order by s.cum_start_m desc
  limit 1;
$$;

-- Snap an arbitrary point (the user's current location) onto a route and
-- return how far along the route that lands. This is how a start point becomes
-- a start_offset_m.
create function public.route_offset_of(
  p_route_id uuid,
  p_point geography
)
returns double precision
language sql
stable
set search_path = public, extensions
as $$
  select s.cum_start_m
       + st_linelocatepoint(s.geom::geometry, p_point::geometry)
       * (s.cum_end_m - s.cum_start_m)
  from public.route_segments s
  where s.route_id = p_route_id
  order by s.geom <-> p_point
  limit 1;
$$;

-- Everything the home screen needs about a journey, in one row.
create view public.journey_progress
with (security_invoker = true) as
with totals as (
  select
    j.id, j.user_id, j.route_id, j.start_offset_m, j.activities_from, j.is_active,
    coalesce((
      select sum(a.distance_m)
      from public.activities a
      where a.user_id = j.user_id
        and a.start_date >= j.activities_from
    ), 0) as travelled_m
  from public.journeys j
),
placed as (
  select
    t.*,
    r.total_distance_m,
    r.name as route_name,
    t.start_offset_m + t.travelled_m as raw_m
  from totals t
  join public.routes r on r.id = t.route_id
),
wrapped as (
  -- Postgres mod() has no double precision overload, so wrap by hand. This is
  -- also what turns a finished lap into the start of the next one.
  select
    p.*,
    floor(p.raw_m / p.total_distance_m) as laps_done
  from placed p
)
select
  w.id       as journey_id,
  w.user_id,
  w.route_id,
  w.is_active,
  w.activities_from,
  w.travelled_m,
  w.total_distance_m,
  w.route_name,
  w.laps_done::integer as laps,
  w.raw_m - w.laps_done * w.total_distance_m as route_offset_m,
  public.route_point_at(
    w.route_id,
    w.raw_m - w.laps_done * w.total_distance_m
  ) as position
from wrapped w;

-- ------------------------------------------------------------------- RLS
alter table public.routes          enable row level security;
alter table public.route_segments  enable row level security;
alter table public.route_landmarks enable row level security;
alter table public.journeys        enable row level security;

-- Curated world routes are shared reference data; custom routes belong to
-- whoever generated them.
create policy "read shared or own routes"
  on public.routes for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));

create policy "read segments of visible routes"
  on public.route_segments for select to authenticated
  using (exists (
    select 1 from public.routes r
    where r.id = route_id
      and (r.owner_id is null or r.owner_id = (select auth.uid()))
  ));

create policy "read landmarks of visible routes"
  on public.route_landmarks for select to authenticated
  using (exists (
    select 1 from public.routes r
    where r.id = route_id
      and (r.owner_id is null or r.owner_id = (select auth.uid()))
  ));

create policy "read own journeys"
  on public.journeys for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "create own journeys"
  on public.journeys for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "update own journeys"
  on public.journeys for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "delete own journeys"
  on public.journeys for delete to authenticated
  using ((select auth.uid()) = user_id);
