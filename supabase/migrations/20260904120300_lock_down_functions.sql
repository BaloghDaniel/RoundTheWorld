-- Postgres grants EXECUTE on new functions to PUBLIC by default, and PostgREST
-- exposes anything in the `public` schema as an RPC endpoint. For SECURITY
-- DEFINER functions that combination is a hole, so revoke from PUBLIC (which
-- anon and authenticated inherit from) and grant back only what is needed.

-- A trigger function has no business being callable over HTTP at all. The
-- trigger itself still fires: it runs as the table owner, not the caller.
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- The UI does need this one, but only when signed in.
revoke all on function public.my_strava_status() from public, anon, authenticated;
grant execute on function public.my_strava_status() to authenticated;
