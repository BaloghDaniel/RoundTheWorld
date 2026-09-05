-- City-to-city goal journeys.
--
-- The world route is a closed loop that wraps forever. A goal route runs from
-- one place to another and is finished on arrival, so progress has to clamp
-- rather than wrap. That difference is what `is_loop` records.

alter table public.routes
  add column is_loop          boolean not null default false,
  add column origin_name      text,
  add column destination_name text;

update public.routes set is_loop = true where slug = 'world';

comment on column public.routes.is_loop is
  'True for a circumnavigation, which wraps and counts laps. False for a goal '
  'route, which ends on arrival.';

-- Goal routes are generated per user by the create-goal-route Edge Function,
-- which holds the routing API key. Reads are already covered by the existing
-- "read shared or own routes" policy; writes stay with the service role.

create or replace view public.journey_progress
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
  select t.*, r.total_distance_m, r.name as route_name, r.is_loop,
         t.start_offset_m + t.travelled_m as raw_m
  from totals t
  join public.routes r on r.id = t.route_id
),
wrapped as (
  select p.*,
         case when p.is_loop then floor(p.raw_m / p.total_distance_m) else 0 end as laps_done
  from placed p
)
select
  w.id as journey_id, w.user_id, w.route_id, w.is_active, w.activities_from,
  w.travelled_m, w.total_distance_m, w.route_name,
  w.laps_done::integer as laps,
  -- A loop wraps; a goal route stops at its destination.
  case
    when w.is_loop then w.raw_m - w.laps_done * w.total_distance_m
    else least(w.raw_m, w.total_distance_m)
  end as route_offset_m,
  public.route_point_at(
    w.route_id,
    case
      when w.is_loop then w.raw_m - w.laps_done * w.total_distance_m
      else least(w.raw_m, w.total_distance_m)
    end
  ) as position,
  w.start_offset_m,
  w.is_loop,
  (not w.is_loop and w.raw_m >= w.total_distance_m) as completed
from wrapped w;

-- Start a journey on an already-created route. Goal routes begin at their own
-- origin, so there is nothing to snap.
create or replace function public.start_route_journey(
  p_route_id uuid,
  p_from date
)
returns uuid
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  j_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if not exists (
    select 1 from public.routes r
    where r.id = p_route_id
      and (r.owner_id is null or r.owner_id = auth.uid())
  ) then
    raise exception 'Route not found';
  end if;

  update public.journeys set is_active = false
    where user_id = auth.uid() and is_active;

  insert into public.journeys (user_id, route_id, start_offset_m, activities_from)
  values (auth.uid(), p_route_id, 0, p_from)
  returning id into j_id;

  return j_id;
end;
$$;

revoke all on function public.start_route_journey(uuid, date) from public, anon, authenticated;
grant execute on function public.start_route_journey(uuid, date) to authenticated;

-- Geometry for a route the caller can see. The world route is served as a
-- static asset; goal routes are per-user, so they come from here.
create or replace function public.route_geometry(p_route_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'slug', r.slug,
    'name', r.name,
    'isLoop', r.is_loop,
    'originName', r.origin_name,
    'destinationName', r.destination_name,
    'totalDistanceM', r.total_distance_m,
    'segments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'mode', s.mode,
        'reason', s.reason,
        'distanceM', s.distance_m,
        'cumStartM', s.cum_start_m,
        'cumEndM', s.cum_end_m,
        'coords', (
          select jsonb_agg(jsonb_build_array(
            round(st_x(p.geom)::numeric, 5), round(st_y(p.geom)::numeric, 5)
          ) order by p.path)
          from (
            select (dp).geom as geom, (dp).path[1] as path
            from st_dumppoints(s.geom::geometry) dp
          ) p
        )
      ) order by s.seq)
      from public.route_segments s where s.route_id = r.id
    ), '[]'::jsonb),
    'landmarks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', l.name, 'country', l.country, 'cumM', l.cum_m,
        'at', jsonb_build_array(
          round(st_x(l.geom::geometry)::numeric, 5),
          round(st_y(l.geom::geometry)::numeric, 5))
      ) order by l.cum_m)
      from public.route_landmarks l where l.route_id = r.id
    ), '[]'::jsonb)
  )
  from public.routes r
  where r.id = p_route_id
    and (r.owner_id is null or r.owner_id = auth.uid());
$$;

revoke all on function public.route_geometry(uuid) from public, anon, authenticated;
grant execute on function public.route_geometry(uuid) to authenticated;
