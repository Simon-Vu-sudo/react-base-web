import { env } from '@/config/env'
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from '@/lib/auth/tokenStore'

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`HTTP ${status}`)
    this.name = 'HttpError'
  }
}

export type HttpHooks = {
  /** Refresh failed: clear the session, clear the Query cache, go to login. */
  onRefreshFailed: () => void
  /** A 403 came back: resync permissions from /auth/me. */
  onForbidden: () => void
}

let hooks: HttpHooks = { onRefreshFailed: () => {}, onForbidden: () => {} }

export function setHttpHooks(next: Partial<HttpHooks>): void {
  hooks = { ...hooks, ...next }
}

const url = (path: string) => `${env.API_URL}${path}`
const isAuthPath = (path: string) => path.startsWith('/auth/')

type RefreshResponse = { accessToken: string; refreshToken: string }

/**
 * Module-level single-flight. N concurrent 401s join one refresh rather than
 * stampeding the endpoint; the slot is released as soon as it settles so a
 * later 401 can refresh again.
 */
let refreshInFlight: Promise<boolean> | null = null

function refreshOnce(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const refreshToken = getRefreshToken()
      if (!refreshToken) return false
      try {
        const res = await fetch(url('/auth/refresh'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        })
        if (!res.ok) return false
        const body = (await res.json()) as RefreshResponse
        setTokens(body)
        return true
      } catch {
        return false
      }
    })().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

function send(path: string, init: RequestInit): Promise<Response> {
  const accessToken = getAccessToken()
  return fetch(url(path), {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
  })
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => '')
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function toResult<T>(res: Response): Promise<T> {
  if (res.status === 403) hooks.onForbidden()
  if (!res.ok) throw new HttpError(res.status, await readBody(res))
  if (res.status === 204) return undefined as T
  return (await readBody(res)) as T
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await send(path, init)

  if (res.status !== 401 || isAuthPath(path)) return toResult<T>(res)

  const refreshed = await refreshOnce()
  if (!refreshed) {
    clearTokens()
    hooks.onRefreshFailed()
    throw new HttpError(401, await readBody(res))
  }

  // Replayed exactly once. There is no loop here by construction: the retry
  // result goes straight to toResult, so a second 401 surfaces as an error.
  const retried = await send(path, init)
  return toResult<T>(retried)
}
