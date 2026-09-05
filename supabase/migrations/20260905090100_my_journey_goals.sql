-- Adds goal-route awareness: the destination, whether it has been reached, and
-- a projected finish from the pace achieved so far. A goal without a sense of
-- when you will arrive is just a number.
create or replace function public.my_journey()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  j record; r record; pos geography;
  next_lm record; prev_lm record; seg record;
  days_elapsed numeric; pace_m_per_day numeric; remaining_m numeric; eta date;
begin
  select * into j from public.journey_progress
  where user_id = auth.uid() and is_active limit 1;
  if not found then return null; end if;

  select slug, origin_name, destination_name, kind into r
  from public.routes where id = j.route_id;

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

  -- Project from the pace actually achieved since the journey's start date.
  days_elapsed := greatest(1, current_date - j.activities_from);
  pace_m_per_day := j.travelled_m / days_elapsed;
  remaining_m := greatest(0, j.total_distance_m - j.route_offset_m);
  if pace_m_per_day > 0 and remaining_m > 0 then
    eta := current_date + ceil(remaining_m / pace_m_per_day)::integer;
  end if;

  return jsonb_build_object(
    'journey_id',       j.journey_id,
    'route_id',         j.route_id,
    'route_slug',       r.slug,
    'route_name',       j.route_name,
    'is_loop',          j.is_loop,
    'completed',        j.completed,
    'origin_name',      r.origin_name,
    'destination_name', r.destination_name,
    'activities_from',  j.activities_from,
    'travelled_m',      j.travelled_m,
    'total_distance_m', j.total_distance_m,
    'remaining_m',      remaining_m,
    'start_offset_m',   j.start_offset_m,
    'laps',             j.laps,
    'route_offset_m',   j.route_offset_m,
    'pace_m_per_day',   round(pace_m_per_day),
    'eta',              eta,
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
