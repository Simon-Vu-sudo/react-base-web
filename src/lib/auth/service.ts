import { HttpError, apiFetch } from '@/lib/http/client'
import { authStore, type User } from './store'

type MeResponse = { user: User }

const logoutHandlers: Array<() => void | Promise<void>> = []

/**
 * Lets the app attach teardown (clear the Query cache, close MQTT) without
 * lib/auth having to import lib/mqtt or the app's query client.
 */
export function registerLogoutHandler(fn: () => void | Promise<void>): void {
  logoutHandlers.push(fn)
}

/**
 * Resolves the session before the router mounts. Has three outcomes, and the
 * third matters: a BE outage must not be reported as "logged out", or every
 * user gets bounced to a login page that cannot work either.
 */
export async function bootstrap(): Promise<void> {
  try {
    const { user } = await apiFetch<MeResponse>('/auth/me')
    authStore.getState().setSession(user)
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) {
      authStore.getState().setUnauthenticated()
      return
    }
    authStore.getState().setBootstrapError()
  }
}

export async function login(credentials: { email: string; password: string }): Promise<void> {
  const res = await apiFetch<MeResponse | undefined>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  })
  if (res?.user) {
    authStore.getState().setSession(res.user)
    return
  }
  const { user } = await apiFetch<MeResponse>('/auth/me')
  authStore.getState().setSession(user)
}

/** Clears local state even if the server call fails — the user asked to leave. */
export async function logout(): Promise<void> {
  try {
    await apiFetch('/auth/logout', { method: 'POST' })
  } catch {
    // ignored on purpose
  }
  authStore.getState().setUnauthenticated()
  for (const fn of logoutHandlers) await fn()
}

/** Resyncs permissions after a 403; wired to the http client's onForbidden hook. */
export async function resyncSession(): Promise<void> {
  try {
    const { user } = await apiFetch<MeResponse>('/auth/me')
    authStore.getState().setSession(user)
  } catch {
    // A failure here is already handled by the 401 path.
  }
}
