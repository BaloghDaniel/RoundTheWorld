-- Drawing the covered portion of the route needs to know where the user
-- started on it, not just where they are now.
--
-- start_offset_m is appended at the end of the view rather than placed beside
-- the other distances, because CREATE OR REPLACE VIEW cannot reorder or rename
-- existing columns.

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
  select t.*, r.total_distance_m, r.name as route_name,
         t.start_offset_m + t.travelled_m as raw_m
  from totals t
  join public.routes r on r.id = t.route_id
),
wrapped as (
  select p.*, floor(p.raw_m / p.total_distance_m) as laps_done
  from placed p
)
select
  w.id as journey_id, w.user_id, w.route_id, w.is_active, w.activities_from,
  w.travelled_m, w.total_distance_m, w.route_name,
  w.laps_done::integer as laps,
  w.raw_m - w.laps_done * w.total_distance_m as route_offset_m,
  public.route_point_at(w.route_id, w.raw_m - w.laps_done * w.total_distance_m) as position,
  w.start_offset_m
from wrapped w;

create or replace function public.my_journey()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  j record; pos geography; next_lm record; prev_lm record; seg record;
begin
  select * into j from public.journey_progress
  where user_id = auth.uid() and is_active limit 1;
  if not found then return null; end if;

  pos := public.route_point_at(j.route_id, j.route_offset_m);

  select l.name, l.country, l.cum_m into next_lm
  from public.route_landmarks l
  where l.route_id = j.route_id and l.cum_m > j.route_offset_m
  order by l.cum_m limit 1;

  select l.name, l.country, l.cum_m into prev_lm
  from public.route_landmarks l
  where l.route_id = j.route_id and l.cum_m <= j.route_offset_m
  order by l.cum_m desc limit 1;

  select s.mode, s.reason into seg
  from public.route_segments s
  where s.route_id = j.route_id and j.route_offset_m >= s.cum_start_m
  order by s.cum_start_m desc limit 1;

  return jsonb_build_object(
    'journey_id',       j.journey_id,
    'route_name',       j.route_name,
    'activities_from',  j.activities_from,
    'travelled_m',      j.travelled_m,
    'total_distance_m', j.total_distance_m,
    'start_offset_m',   j.start_offset_m,
    'laps',             j.laps,
    'route_offset_m',   j.route_offset_m,
    'position',         jsonb_build_object('lon', st_x(pos::geometry), 'lat', st_y(pos::geometry)),
    'segment',          case when seg is null then null else
                          jsonb_build_object('mode', seg.mode, 'reason', seg.reason) end,
    'passed',           case when prev_lm is null then null else
                          jsonb_build_object('name', prev_lm.name, 'country', prev_lm.country,
                                             'behind_m', j.route_offset_m - prev_lm.cum_m) end,
    'next',             case when next_lm is null then null else
                          jsonb_build_object('name', next_lm.name, 'country', next_lm.country,
                                             'ahead_m', next_lm.cum_m - j.route_offset_m) end
  );
end;
$$;

revoke all on function public.my_journey() from public, anon, authenticated;
grant execute on function public.my_journey() to authenticated;
