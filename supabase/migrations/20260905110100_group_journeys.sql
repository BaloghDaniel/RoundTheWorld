-- Group journeys, starting with Tag Along.
--
-- Every member keeps their own journey row on the shared route, so each has
-- their own start date and their own distance. The group only decides how
-- those individual distances are combined and displayed.

create table public.journey_groups (
  id         uuid primary key default gen_random_uuid(),
  route_id   uuid not null references public.routes (id) on delete cascade,
  owner_id   uuid not null references auth.users (id) on delete cascade,
  mode       text not null default 'tag_along'
               check (mode in ('tag_along', 'race', 'scramble')),
  -- Tag Along: how far ahead a runner may get before they must wait. Race and
  -- Scramble will ignore this.
  max_gap_m  double precision not null default 100000,
  created_at timestamptz not null default now()
);

create table public.journey_group_members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.journey_groups (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  -- Null until the invitation is accepted; accepting creates the journey.
  journey_id uuid references public.journeys (id) on delete cascade,
  status     text not null default 'invited'
               check (status in ('invited', 'joined', 'declined')),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create index journey_group_members_user_idx on public.journey_group_members (user_id, status);

alter table public.journeys add column group_id uuid references public.journey_groups (id) on delete set null;

alter table public.journey_groups        enable row level security;
alter table public.journey_group_members enable row level security;

/** True when the user is invited to, or has joined, this group. */
create or replace function public.in_group(p_group_id uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.journey_group_members m
    where m.group_id = p_group_id and m.user_id = p_user and m.status <> 'declined'
  );
$$;

revoke all on function public.in_group(uuid, uuid) from public, anon, authenticated;
grant execute on function public.in_group(uuid, uuid) to authenticated;

create policy "see groups you belong to"
  on public.journey_groups for select to authenticated
  using (owner_id = (select auth.uid()) or public.in_group(id, (select auth.uid())));

create policy "see your own membership rows"
  on public.journey_group_members for select to authenticated
  using (user_id = (select auth.uid()) or public.in_group(group_id, (select auth.uid())));

-- People running together need to see each other's names and faces.
create policy "read profiles of people you run with"
  on public.profiles for select to authenticated
  using (exists (
    select 1
    from public.journey_group_members mine
    join public.journey_group_members theirs on theirs.group_id = mine.group_id
    where mine.user_id = (select auth.uid())
      and mine.status <> 'declined'
      and theirs.user_id = profiles.id
      and theirs.status <> 'declined'
  ));

-- Members read each other's journeys so the map can show every runner.
create policy "read journeys in your groups"
  on public.journeys for select to authenticated
  using (group_id is not null and public.in_group(group_id, (select auth.uid())));

-- ------------------------------------------------------------- operations

/** Create a group on a route, start the owner's journey, invite friends. */
create or replace function public.start_group_journey(
  p_route_id  uuid,
  p_from      date,
  p_mode      text default 'tag_along',
  p_invitees  uuid[] default '{}',
  p_max_gap_m double precision default 100000
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  g_id uuid; j_id uuid; invitee uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  if not exists (
    select 1 from public.routes r
    where r.id = p_route_id and (r.owner_id is null or r.owner_id = auth.uid())
  ) then
    raise exception 'Route not found';
  end if;

  insert into public.journey_groups (route_id, owner_id, mode, max_gap_m)
  values (p_route_id, auth.uid(), p_mode, p_max_gap_m)
  returning id into g_id;

  insert into public.journeys (user_id, route_id, start_offset_m, activities_from, group_id)
  values (auth.uid(), p_route_id, 0, p_from, g_id)
  returning id into j_id;

  insert into public.journey_group_members (group_id, user_id, journey_id, status, invited_by)
  values (g_id, auth.uid(), j_id, 'joined', auth.uid());

  -- Only friends can be invited; anything else is silently skipped rather
  -- than failing the whole call.
  foreach invitee in array coalesce(p_invitees, '{}') loop
    if invitee <> auth.uid() and public.are_friends(auth.uid(), invitee) then
      insert into public.journey_group_members (group_id, user_id, status, invited_by)
      values (g_id, invitee, 'invited', auth.uid())
      on conflict (group_id, user_id) do nothing;
    end if;
  end loop;

  return j_id;
end;
$$;

revoke all on function public.start_group_journey(uuid, date, text, uuid[], double precision)
  from public, anon, authenticated;
grant execute on function public.start_group_journey(uuid, date, text, uuid[], double precision)
  to authenticated;

/** Accept or decline an invitation. Accepting creates that member's journey. */
create or replace function public.respond_to_group_invite(
  p_group_id uuid,
  p_accept   boolean,
  p_from     date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r_id uuid; j_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  select g.route_id into r_id
  from public.journey_groups g
  join public.journey_group_members m
    on m.group_id = g.id and m.user_id = auth.uid() and m.status = 'invited'
  where g.id = p_group_id;

  if r_id is null then raise exception 'No pending invitation'; end if;

  if not p_accept then
    update public.journey_group_members set status = 'declined'
      where group_id = p_group_id and user_id = auth.uid();
    return null;
  end if;

  insert into public.journeys (user_id, route_id, start_offset_m, activities_from, group_id)
  values (auth.uid(), r_id, 0, p_from, p_group_id)
  returning id into j_id;

  update public.journey_group_members
    set status = 'joined', journey_id = j_id
    where group_id = p_group_id and user_id = auth.uid();

  return j_id;
end;
$$;

revoke all on function public.respond_to_group_invite(uuid, boolean, date)
  from public, anon, authenticated;
grant execute on function public.respond_to_group_invite(uuid, boolean, date) to authenticated;

/** Invitations awaiting an answer. */
create or replace function public.my_group_invites()
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
  from (
    select
      g.id as group_id, g.mode, g.max_gap_m,
      rt.name as route_name, rt.origin_name, rt.destination_name,
      rt.total_distance_m, rt.is_loop,
      inviter.display_name as invited_by_name,
      inviter.avatar_url  as invited_by_avatar
    from public.journey_group_members m
    join public.journey_groups g on g.id = m.group_id
    join public.routes rt on rt.id = g.route_id
    left join public.profiles inviter on inviter.id = m.invited_by
    where m.user_id = auth.uid() and m.status = 'invited'
    order by m.created_at desc
  ) r;
$$;

revoke all on function public.my_group_invites() from public, anon, authenticated;
grant execute on function public.my_group_invites() to authenticated;

/**
 * Where every runner in a group stands.
 *
 * Tag Along holds the party together: nobody's shown position may get more
 * than max_gap_m ahead of the runner furthest back. The distance a leader runs
 * while waiting is not lost -- it stays in their raw total and reappears the
 * moment the straggler catches up.
 */
create or replace function public.group_state(p_group_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  with allowed as (
    select public.in_group(p_group_id, auth.uid()) as ok
  ),
  grp as (
    select g.id, g.mode, g.max_gap_m, g.route_id, r.total_distance_m, r.is_loop
    from public.journey_groups g
    join public.routes r on r.id = g.route_id
    where g.id = p_group_id and (select ok from allowed)
  ),
  runners as (
    select
      m.user_id,
      m.journey_id,
      p.display_name,
      p.avatar_url,
      p.handle,
      jp.travelled_m,
      jp.start_offset_m + jp.travelled_m as raw_m
    from public.journey_group_members m
    join public.journeys j on j.id = m.journey_id
    join public.journey_progress jp on jp.journey_id = m.journey_id
    join public.profiles p on p.id = m.user_id
    where m.group_id = p_group_id and m.status = 'joined'
  ),
  bounds as (
    select min(raw_m) as slowest_m from runners
  ),
  placed as (
    select
      r.*,
      case
        when g.mode = 'tag_along'
          then least(r.raw_m, b.slowest_m + g.max_gap_m)
        else r.raw_m
      end as effective_m,
      g.total_distance_m,
      g.max_gap_m,
      g.mode
    from runners r, grp g, bounds b
  )
  select case when (select ok from allowed) is not true then null else
    jsonb_build_object(
      'group_id', p_group_id,
      'mode', (select mode from grp),
      'max_gap_m', (select max_gap_m from grp),
      'slowest_m', (select slowest_m from bounds),
      'runners', coalesce((
        select jsonb_agg(jsonb_build_object(
          'user_id', pl.user_id,
          'journey_id', pl.journey_id,
          'display_name', pl.display_name,
          'handle', pl.handle,
          'avatar_url', pl.avatar_url,
          'travelled_m', pl.travelled_m,
          'raw_m', pl.raw_m,
          'effective_m', least(pl.effective_m, pl.total_distance_m),
          -- Held back because someone else is too far behind.
          'waiting', pl.raw_m > pl.effective_m + 0.5,
          'held_back_m', greatest(0, pl.raw_m - pl.effective_m),
          'position', (
            select jsonb_build_object('lon', st_x(pt::geometry), 'lat', st_y(pt::geometry))
            from public.route_point_at(
              (select route_id from grp),
              least(pl.effective_m, pl.total_distance_m)
            ) pt
          )
        ) order by pl.effective_m desc)
        from placed pl
      ), '[]'::jsonb)
    )
  end;
$$;

revoke all on function public.group_state(uuid) from public, anon, authenticated;
grant execute on function public.group_state(uuid) to authenticated;

-- journey_detail and my_journeys expose the group, so a journey screen can
-- fetch its party and the list can badge shared journeys.
-- (Applied as part of this migration; see git history for the full bodies.)
