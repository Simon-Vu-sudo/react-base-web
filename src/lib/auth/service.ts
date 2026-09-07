import { HttpError, apiFetch } from '@/lib/http/client'
import { decodeJwt, isExpired, type JwtClaims } from './jwt'
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from './tokenStore'
import { authStore, type User } from './store'

type TokenResponse = { accessToken: string; refreshToken: string }

const logoutHandlers: Array<() => void | Promise<void>> = []

/**
 * Lets the app attach teardown (clear the Query cache, close MQTT) without
 * lib/auth having to import lib/mqtt or the app's query client.
 */
export function registerLogoutHandler(fn: () => void | Promise<void>): void {
  logoutHandlers.push(fn)
}

/**
 * Clears all registered logout handlers. For testing only.
 */
export function clearLogoutHandlers(): void {
  logoutHandlers.length = 0
}

/** Maps decoded JWT claims onto the session shape the store wants. */
function sessionFromClaims(claims: JwtClaims | null): User | null {
  if (!claims) return null
  return { id: claims.sub, email: claims.email, name: claims.name, roles: claims.roles }
}

/**
 * Resolves the session before the router mounts. There is no `/auth/me`
 * under Bearer auth — identity and roles come straight from decoding the
 * access token already in storage, so bootstrap makes no network call in
 * the common case.
 *
 * Three outcomes, and the third matters:
 *  - no token, or an undecodable one -> unauthenticated
 *  - a valid, unexpired token -> authenticated, decoded straight from it
 *  - an expired token -> one refresh attempt. A 401 from that (the refresh
 *    token is also dead) means the session is genuinely over. A network
 *    failure means the server could not be reached, which is NOT the same
 *    as logged out — that is the bootstrapError case. Collapsing the two
 *    would silently sign out every user during a BE outage.
 */
export async function bootstrap(): Promise<void> {
  const accessToken = getAccessToken()
  if (!accessToken) {
    authStore.getState().setUnauthenticated()
    return
  }

  const claims = decodeJwt(accessToken)
  if (!claims) {
    clearTokens()
    authStore.getState().setUnauthenticated()
    return
  }

  if (!isExpired(claims)) {
    const session = sessionFromClaims(claims)
    if (!session) {
      clearTokens()
      authStore.getState().setUnauthenticated()
      return
    }
    authStore.getState().setSession(session)
    return
  }

  const refreshToken = getRefreshToken()
  if (!refreshToken) {
    clearTokens()
    authStore.getState().setUnauthenticated()
    return
  }

  try {
    const tokens = await apiFetch<TokenResponse>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    })
    const session = sessionFromClaims(decodeJwt(tokens.accessToken))
    if (!session) {
      clearTokens()
      authStore.getState().setUnauthenticated()
      return
    }
    setTokens(tokens)
    authStore.getState().setSession(session)
  } catch (err) {
    if (err instanceof HttpError) {
      clearTokens()
      authStore.getState().setUnauthenticated()
      return
    }
    // Network error / 5xx: cannot tell if the session is still good.
    authStore.getState().setBootstrapError()
  }
}

export async function login(credentials: { email: string; password: string }): Promise<void> {
  const tokens = await apiFetch<TokenResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  })
  const session = sessionFromClaims(decodeJwt(tokens.accessToken))
  if (!session) throw new Error('Login response did not contain a valid access token')
  setTokens(tokens)
  authStore.getState().setSession(session)
}

/** Clears local state even if the server call fails — the user asked to leave. */
export async function logout(): Promise<void> {
  try {
    await apiFetch('/auth/logout', { method: 'POST' })
  } catch {
    // ignored on purpose
  }
  clearTokens()
  authStore.getState().setUnauthenticated()
  for (const fn of logoutHandlers) await fn()
}

/**
 * Resyncs the session after a 403; wired to the http client's onForbidden
 * hook. There is no `/auth/me` to re-fetch under Bearer auth, so the honest
 * way to observe a role change made on the BE mid-session is to force a
 * fresh access token and decode it. A failure here leaves the session as-is
 * — the existing 401 path already handles a truly dead session.
 */
export async function resyncSession(): Promise<void> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return
  try {
    const tokens = await apiFetch<TokenResponse>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    })
    const session = sessionFromClaims(decodeJwt(tokens.accessToken))
    if (!session) return
    setTokens(tokens)
    authStore.getState().setSession(session)
  } catch {
    // Leave the session as-is; the 401 path handles a truly dead session.
  }
}
