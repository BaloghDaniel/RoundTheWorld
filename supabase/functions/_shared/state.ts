// The OAuth `state` parameter has to survive a round trip through Strava and
// come back provably untampered, because the callback runs without a JWT and
// has nothing else to tell it which user it is acting for.
//
// An HMAC-signed, expiring token does this without a database table.

const encoder = new TextEncoder()

async function key(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

function b64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

function unb64url(text: string) {
  const padded = text.replaceAll('-', '+').replaceAll('_', '/')
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

const TTL_MS = 10 * 60 * 1000

/** Sign `userId` into an opaque state token valid for ten minutes. */
export async function signState(userId: string, secret: string) {
  const payload = b64url(encoder.encode(JSON.stringify({ userId, exp: Date.now() + TTL_MS })))
  const sig = await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(payload))
  return `${payload}.${b64url(new Uint8Array(sig))}`
}

/** Returns the user id, or null if the token is forged, malformed or expired. */
export async function verifyState(token: string, secret: string): Promise<string | null> {
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null

  const ok = await crypto.subtle.verify(
    'HMAC',
    await key(secret),
    unb64url(sig),
    encoder.encode(payload),
  )
  if (!ok) return null

  try {
    const { userId, exp } = JSON.parse(new TextDecoder().decode(unb64url(payload)))
    if (typeof userId !== 'string' || typeof exp !== 'number') return null
    return Date.now() < exp ? userId : null
  } catch {
    return null
  }
}
