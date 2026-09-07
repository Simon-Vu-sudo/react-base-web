/**
 * Decodes a JWT's claims for display and UI gating only. This module never
 * verifies the signature — the frontend cannot hold the signing secret, and
 * a client-side "check" of a signature it has no key for would prove
 * nothing to an attacker who can just edit the token in devtools. The
 * backend, which does hold the secret and re-verifies every request, is the
 * only real authorization boundary (see docs §4). Treat every field here as
 * "what the token claims", not "what is true".
 */

export type JwtClaims = {
  sub: string
  email: string
  name: string
  roles: string[]
  exp: number
}

function base64UrlDecode(segment: string): string | null {
  try {
    const padded = segment.replace(/-/g, '+').replace(/_/g, '/')
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
    // atob throws on invalid base64; caught by the caller.
    const binary = atob(padded + pad)
    // atob gives a binary string; decode it as UTF-8 bytes so non-ASCII
    // claims (names, emails) survive intact.
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

function isJwtClaims(value: unknown): value is JwtClaims {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.sub === 'string' &&
    typeof v.email === 'string' &&
    typeof v.name === 'string' &&
    Array.isArray(v.roles) &&
    v.roles.every((r) => typeof r === 'string') &&
    typeof v.exp === 'number'
  )
}

/**
 * Decodes the base64url payload of a JWT. Never throws: malformed input
 * (wrong segment count, bad base64, non-JSON, missing required claims)
 * returns null instead. This runs during bootstrap against whatever is
 * sitting in localStorage, and a corrupted value there must not white-screen
 * the app.
 */
export function decodeJwt(token: string): JwtClaims | null {
  if (typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null

  const json = base64UrlDecode(parts[1])
  if (json === null) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }

  return isJwtClaims(parsed) ? parsed : null
}

export function isExpired(claims: JwtClaims, now: number = Date.now()): boolean {
  return claims.exp * 1000 <= now
}
