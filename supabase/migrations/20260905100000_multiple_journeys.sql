-- Journeys become a list rather than a single current one.
--
-- One active journey per user was too strict: the same activities can feed a
-- circumnavigation and a run at Madrid at the same time, and the user should
-- choose which to look at rather than have the last one created win.

drop index if exists public.journeys_one_active_per_user;

-- Starting a journey no longer retires the others.
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

  insert into public.journeys (user_id, route_id, start_offset_m, activities_from)
  values (auth.uid(), p_route_id, 0, p_from)
  returning id into j_id;

  return j_id;
end;
$$;

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
  r_id uuid; offset_m double precision := 0; j_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select id into r_id from public.routes where slug = p_route_slug;
  if r_id is null then
    raise exception 'Unknown route %', p_route_slug;
  end if;

  if p_lon is not null and p_lat is not null then
    offset_m := coalesce(
      public.route_offset_of(r_id, st_point(p_lon, p_lat)::geography), 0
    );
    update public.profiles
      set home_point = st_point(p_lon, p_lat)::geography, updated_at = now()
      where id = auth.uid();
  end if;

  insert into public.journeys (user_id, route_id, start_offset_m, activities_from)
  values (auth.uid(), r_id, offset_m, p_from)
  returning id into j_id;

  return j_id;
end;
$$;

-- Summary of every journey the user has, newest first.
create or replace function public.my_journeys()
returns jsonb
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'journey_id',       jp.journey_id,
      'route_id',         jp.route_id,
      'route_slug',       r.slug,
      'route_name',       jp.route_name,
      'is_loop',          jp.is_loop,
      'completed',        jp.completed,
      'origin_name',      r.origin_name,
      'destination_name', r.destination_name,
      'activities_from',  jp.activities_from,
      'travelled_m',      jp.travelled_m,
      'total_distance_m', jp.total_distance_m,
      'remaining_m',      greatest(0, jp.total_distance_m - jp.route_offset_m),
      'laps',             jp.laps,
      'created_at',       j.created_at
    ) as x
    from public.journey_progress jp
    join public.journeys j on j.id = jp.journey_id
    join public.routes r on r.id = jp.route_id
    where jp.user_id = auth.uid()
  ) s;
$$;

revoke all on function public.my_journeys() from public, anon, authenticated;
grant execute on function public.my_journeys() to authenticated;

-- Everything one journey's screen needs.
create or replace function public.journey_detail(p_journey_id uuid)
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
  where journey_id = p_journey_id and user_id = auth.uid();
  if not found then return null; end if;

  select slug, origin_name, destination_name into r
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

revoke all on function public.journey_detail(uuid) from public, anon, authenticated;
grant execute on function public.journey_detail(uuid) to authenticated;

-- Delete a journey, and the goal route behind it if nothing else uses it.
-- Definer because routes have no delete policy for the browser.
create or replace function public.delete_journey(p_journey_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select route_id into r_id from public.journeys
  where id = p_journey_id and user_id = auth.uid();
  if r_id is null then
    raise exception 'Journey not found';
  end if;

  delete from public.journeys where id = p_journey_id and user_id = auth.uid();

  -- Shared routes stay; a personal goal route with no journeys left is litter.
  delete from public.routes
  where id = r_id
    and owner_id = auth.uid()
    and not exists (select 1 from public.journeys j where j.route_id = r_id);
end;
$$;

revoke all on function public.delete_journey(uuid) from public, anon, authenticated;
grant execute on function public.delete_journey(uuid) to authenticated;

drop function if exists public.my_journey();
