-- Strava's API terms require that a user can revoke access and have their data
-- removed. strava_connections is unreachable from the browser by design, so
-- disconnecting needs a definer function that acts only on the caller's rows.

create function public.disconnect_strava()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  delete from public.activities         where user_id = uid;
  delete from public.strava_connections where user_id = uid;
end;
$$;

revoke all on function public.disconnect_strava() from public, anon, authenticated;
grant execute on function public.disconnect_strava() to authenticated;
