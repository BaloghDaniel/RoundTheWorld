import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. ' +
      'Copy .env.example to .env.local for development; in CI these come from ' +
      'GitHub Actions repository variables.',
  )
}

export const supabase = createClient(url, key, {
  auth: {
    // PKCE returns ?code= in the query string rather than a hash fragment,
    // which keeps the OAuth return leg from colliding with client routing.
    flowType: 'pkce',
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
})

/** Where Google should send the user back to after sign-in. */
export function authRedirectTo() {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString()
}
