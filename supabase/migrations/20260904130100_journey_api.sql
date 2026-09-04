-- Everything the journey screen needs, in one round trip.
--
-- Geometry is not returned here: the full route is served as a static asset
-- from GitHub Pages and cached by the service worker, so the only thing the
-- client needs from the database is where it currently stands on that route.

create or replace function public.my_journey()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  j        record;
  pos      geography;
  next_lm  record;
  prev_lm  record;
  seg      record;
begin
  select * into j
  from public.journey_progress
  where user_id = auth.uid() and is_active
  limit 1;

  if not found then
    return null;
  end if;

  pos := public.route_point_at(j.route_id, j.route_offset_m);

  -- The landmark just passed, and the one being approached. Wrapping past the
  -- end of a lap is why these are two separate lookups rather than a window.
  select l.name, l.country, l.cum_m into next_lm
  from public.route_landmarks l
  where l.route_id = j.route_id and l.cum_m > j.route_offset_m
  order by l.cum_m
  limit 1;

  select l.name, l.country, l.cum_m into prev_lm
  from public.route_landmarks l
  where l.route_id = j.route_id and l.cum_m <= j.route_offset_m
  order by l.cum_m desc
  limit 1;

  select s.mode, s.reason into seg
  from public.route_segments s
  where s.route_id = j.route_id and j.route_offset_m >= s.cum_start_m
  order by s.cum_start_m desc
  limit 1;

  return jsonb_build_object(
    'journey_id',       j.journey_id,
    'route_name',       j.route_name,
    'activities_from',  j.activities_from,
    'travelled_m',      j.travelled_m,
    'total_distance_m', j.total_distance_m,
    'laps',             j.laps,
    'route_offset_m',   j.route_offset_m,
    'position',         jsonb_build_object(
                          'lon', st_x(pos::geometry),
                          'lat', st_y(pos::geometry)
                        ),
    'segment',          case when seg is null then null else jsonb_build_object(
                          'mode', seg.mode, 'reason', seg.reason
                        ) end,
    'passed',           case when prev_lm is null then null else jsonb_build_object(
                          'name', prev_lm.name, 'country', prev_lm.country,
                          'behind_m', j.route_offset_m - prev_lm.cum_m
                        ) end,
    'next',             case when next_lm is null then null else jsonb_build_object(
                          'name', next_lm.name, 'country', next_lm.country,
                          'ahead_m', next_lm.cum_m - j.route_offset_m
                        ) end
  );
end;
$$;

revoke all on function public.my_journey() from public, anon, authenticated;
grant execute on function public.my_journey() to authenticated;

-- Create the user's journey, snapping their chosen start point onto the route.
-- Returns the journey id.
create or replace function public.start_journey(
  p_route_slug text,
  p_from date,
  p_lon double precision default null,
  p_lat double precision default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  r_id     uuid;
  offset_m double precision := 0;
  j_id     uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select id into r_id from public.routes where slug = p_route_slug;
  if r_id is null then
    raise exception 'Unknown route %', p_route_slug;
  end if;

  -- The route is a fixed loop, so a start point rotates it rather than
  -- generating anything new. With no point given, start at the route's origin.
  if p_lon is not null and p_lat is not null then
    offset_m := coalesce(
      public.route_offset_of(r_id, st_point(p_lon, p_lat)::geography), 0
    );
    update public.profiles
      set home_point = st_point(p_lon, p_lat)::geography, updated_at = now()
      where id = auth.uid();
  end if;

  -- One active journey per user; starting a new one retires the old.
  update public.journeys set is_active = false
    where user_id = auth.uid() and is_active;

  insert into public.journeys (user_id, route_id, start_offset_m, activities_from)
  values (auth.uid(), r_id, offset_m, p_from)
  returning id into j_id;

  return j_id;
end;
$$;

revoke all on function public.start_journey(text, date, double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.start_journey(text, date, double precision, double precision)
  to authenticated;
