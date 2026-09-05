import { createClient } from 'npm:@supabase/supabase-js@2'

export const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })
}

/** Service-role client. Bypasses RLS, so it is the only thing able to read
 *  strava_connections or write activities. Never hand this to the browser. */
export function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
}

/** Resolve the caller from their Authorization header, or null if unauthenticated. */
export async function callerId(req: Request): Promise<string | null> {
  const authorization = req.headers.get('Authorization')
  if (!authorization) return null

  const scoped = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } },
  )

  const { data, error } = await scoped.auth.getUser()
  return error ? null : (data.user?.id ?? null)
}

/** Base URL of the deployed PWA, used for post-OAuth redirects. */
export function appUrl() {
  return Deno.env.get('APP_URL') ?? 'https://baloghdaniel.github.io/roundtheworld/'
}
