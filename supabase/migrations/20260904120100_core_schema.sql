-- Core user-owned tables: profile, Strava connection, synced activities.

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url   text,
  -- Where the user started their journey. Defaults to their current position
  -- at onboarding, and is snapped onto the route to derive start_offset_m.
  home_point   geography (point, 4326),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.profiles is
  'Public-facing user data. One row per auth user, created automatically on signup.';

-- Populate a profile the moment a user signs in with Google, so the rest of
-- the app can assume it exists.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------ strava_connections
create table public.strava_connections (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  athlete_id    bigint      not null unique,
  access_token  text        not null,
  refresh_token text        not null,
  expires_at    timestamptz not null,
  scope         text,
  last_sync_at  timestamptz,
  created_at    timestamptz not null default now()
);

comment on table public.strava_connections is
  'OAuth tokens. Deliberately has no RLS policies: only Edge Functions using the '
  'service role may read it. The browser learns connection state via '
  'public.my_strava_status() instead.';

-- ------------------------------------------------------------- activities
create table public.activities (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid   not null references auth.users (id) on delete cascade,
  strava_activity_id bigint not null,
  sport_type         text   not null,
  name               text,
  -- Only the scalar distance is stored. We never fetch or keep GPS tracks:
  -- the journey is drawn on our own route geometry, not the user's.
  distance_m         double precision not null check (distance_m >= 0),
  moving_time_s      integer,
  start_date         timestamptz not null,
  created_at         timestamptz not null default now(),
  unique (user_id, strava_activity_id)
);

create index activities_user_start_idx
  on public.activities (user_id, start_date desc);

-- ------------------------------------------------------------------- RLS
alter table public.profiles           enable row level security;
alter table public.strava_connections enable row level security;
alter table public.activities         enable row level security;

create policy "read own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "update own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- No policies on strava_connections: everything is denied to anon and
-- authenticated. The service role bypasses RLS and is the only reader.

create policy "read own activities"
  on public.activities for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "delete own activities"
  on public.activities for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Writes to activities come only from the sync Edge Function (service role).

-- ------------------------------------------------ connection status for UI
-- Lets the browser see *whether* Strava is connected without ever being able
-- to read the tokens themselves.
create function public.my_strava_status()
returns table (connected boolean, athlete_id bigint, last_sync_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select true, c.athlete_id, c.last_sync_at
  from public.strava_connections c
  where c.user_id = auth.uid()
  union all
  select false, null::bigint, null::timestamptz
  where not exists (
    select 1 from public.strava_connections c where c.user_id = auth.uid()
  );
$$;

revoke execute on function public.my_strava_status() from anon;
grant execute on function public.my_strava_status() to authenticated;
