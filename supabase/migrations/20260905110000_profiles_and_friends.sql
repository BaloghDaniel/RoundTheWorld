-- Profiles become visible to other people, and people can befriend each other.

-- A stable, searchable handle. Display names are neither unique nor reliable
-- to search on, and email must never be searchable.
alter table public.profiles add column handle text unique;

create or replace function public.slugify_handle(p_text text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(
    regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '', 'g'),
    ''
  );
$$;

-- Backfill and default new users from their name, with a numeric suffix on
-- collision so signup can never fail on a duplicate.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
  candidate text;
  n integer := 0;
begin
  base := coalesce(
    public.slugify_handle(new.raw_user_meta_data ->> 'full_name'),
    public.slugify_handle(split_part(new.email, '@', 1)),
    'runner'
  );
  candidate := left(base, 24);

  while exists (select 1 from public.profiles p where p.handle = candidate) loop
    n := n + 1;
    candidate := left(base, 20) || n::text;
  end loop;

  insert into public.profiles (id, display_name, avatar_url, handle)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url',
    candidate
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

update public.profiles p
set handle = coalesce(
  p.handle,
  left(coalesce(public.slugify_handle(p.display_name), 'runner'), 24)
)
where p.handle is null;

-- ------------------------------------------------------------ friendships
create table public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status       text not null default 'pending'
                 check (status in ('pending', 'accepted', 'declined')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  constraint no_self_friendship check (requester_id <> addressee_id),
  unique (requester_id, addressee_id)
);

create index friendships_addressee_idx on public.friendships (addressee_id, status);
create index friendships_requester_idx on public.friendships (requester_id, status);

alter table public.friendships enable row level security;

create policy "see friendships you are part of"
  on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

create policy "send your own requests"
  on public.friendships for insert to authenticated
  with check ((select auth.uid()) = requester_id);

-- Only the addressee answers, and only a pending request.
create policy "answer requests sent to you"
  on public.friendships for update to authenticated
  using ((select auth.uid()) = addressee_id)
  with check ((select auth.uid()) = addressee_id);

create policy "withdraw or remove"
  on public.friendships for delete to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

/** True when two users are accepted friends, either direction. */
create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b)
        or (f.requester_id = b and f.addressee_id = a))
  );
$$;

revoke all on function public.are_friends(uuid, uuid) from public, anon, authenticated;
grant execute on function public.are_friends(uuid, uuid) to authenticated;

-- Friends can see each other's profile.
create policy "read friends' profiles"
  on public.profiles for select to authenticated
  using (public.are_friends((select auth.uid()), id));

-- ------------------------------------------------------------ user search
-- Definer so a search can match people who are not yet friends, while
-- returning only what a search result needs. Email is never exposed.
create or replace function public.search_users(p_query text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
  from (
    select
      p.id,
      p.display_name,
      p.handle,
      p.avatar_url,
      coalesce(f.status, 'none') as friendship,
      case when f.requester_id = auth.uid() then 'outgoing'
           when f.addressee_id = auth.uid() then 'incoming'
           else null end as direction
    from public.profiles p
    left join public.friendships f
      on (f.requester_id = auth.uid() and f.addressee_id = p.id)
      or (f.addressee_id = auth.uid() and f.requester_id = p.id)
    where auth.uid() is not null
      and p.id <> auth.uid()
      and length(btrim(p_query)) >= 2
      and (p.handle ilike '%' || btrim(p_query) || '%'
        or p.display_name ilike '%' || btrim(p_query) || '%')
    order by
      case when p.handle ilike btrim(p_query) || '%' then 0 else 1 end,
      p.display_name
    limit 20
  ) r;
$$;

revoke all on function public.search_users(text) from public, anon, authenticated;
grant execute on function public.search_users(text) to authenticated;

/** Friends and pending requests in both directions. */
create or replace function public.my_friends()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.display_name), '[]'::jsonb)
  from (
    select
      p.id, p.display_name, p.handle, p.avatar_url,
      f.status,
      case when f.requester_id = auth.uid() then 'outgoing' else 'incoming' end as direction,
      f.id as friendship_id
    from public.friendships f
    join public.profiles p
      on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
    where auth.uid() in (f.requester_id, f.addressee_id)
      and f.status <> 'declined'
  ) r;
$$;

revoke all on function public.my_friends() from public, anon, authenticated;
grant execute on function public.my_friends() to authenticated;

create or replace function public.send_friend_request(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_user_id = auth.uid() then raise exception 'You cannot befriend yourself'; end if;

  -- If they already asked you, accept rather than creating a mirror request.
  update public.friendships
    set status = 'accepted', responded_at = now()
    where requester_id = p_user_id and addressee_id = auth.uid() and status = 'pending';
  if found then return; end if;

  insert into public.friendships (requester_id, addressee_id)
  values (auth.uid(), p_user_id)
  on conflict (requester_id, addressee_id) do nothing;
end;
$$;

revoke all on function public.send_friend_request(uuid) from public, anon, authenticated;
grant execute on function public.send_friend_request(uuid) to authenticated;

create or replace function public.respond_to_friend_request(
  p_friendship_id uuid,
  p_accept boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  update public.friendships
    set status = case when p_accept then 'accepted' else 'declined' end,
        responded_at = now()
    where id = p_friendship_id
      and addressee_id = auth.uid()
      and status = 'pending';

  if not found then raise exception 'No pending request to answer'; end if;
end;
$$;

revoke all on function public.respond_to_friend_request(uuid, boolean) from public, anon, authenticated;
grant execute on function public.respond_to_friend_request(uuid, boolean) to authenticated;

create or replace function public.remove_friend(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  delete from public.friendships
  where (requester_id = auth.uid() and addressee_id = p_user_id)
     or (addressee_id = auth.uid() and requester_id = p_user_id);
end;
$$;

revoke all on function public.remove_friend(uuid) from public, anon, authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;

-- ---------------------------------------------------------------- avatars
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152,
        array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Anyone may look at an avatar; you may only write inside your own folder,
-- which is named after your user id.
create policy "avatars are public to read"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "write your own avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "replace your own avatar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "delete your own avatar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

/** The signed-in user's own profile, including handle. */
create or replace function public.my_profile()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select to_jsonb(p) from public.profiles p where p.id = auth.uid();
$$;

revoke all on function public.my_profile() from public, anon, authenticated;
grant execute on function public.my_profile() to authenticated;
