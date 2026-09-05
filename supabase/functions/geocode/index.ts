// Place search for picking a start and a goal.
//
// Proxied rather than called from the browser so the routing key stays on the
// server, and so swapping geocoder later touches nothing in the app.

import { callerId, corsHeaders, json } from '../_shared/http.ts'
import { geocode } from '../_shared/ors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const userId = await callerId(req)
  if (!userId) return json({ error: 'Not signed in' }, 401)

  const text = new URL(req.url).searchParams.get('q')?.trim() ?? ''
  if (text.length < 2) return json({ results: [] })

  try {
    return json({ results: await geocode(text) })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Search failed' }, 502)
  }
})
