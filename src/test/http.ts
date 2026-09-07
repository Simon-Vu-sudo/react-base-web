import { vi } from 'vitest'

type Responder = (req: { method: string; path: string; init: RequestInit }) => Response

const routes = new Map<string, Responder>()
const calls: { method: string; path: string; init: RequestInit }[] = []

const key = (method: string, path: string) => `${method.toUpperCase()} ${path}`

/** Register a canned response. A plain object is sent as 200 JSON. */
export function mockRoute(
  method: string,
  path: string,
  responder: Responder | Response | { status?: number; body?: unknown; headers?: HeadersInit },
): void {
  if (typeof responder === 'function') {
    routes.set(key(method, path), responder)
    return
  }
  if (responder instanceof Response) {
    routes.set(key(method, path), () => responder.clone())
    return
  }
  const { status = 200, body, headers } = responder
  routes.set(key(method, path), () =>
    body === undefined
      ? new Response(null, { status, headers })
      : new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json', ...headers },
        }),
  )
}

/** Make the next call to this route throw, simulating a network failure. */
export function mockNetworkError(method: string, path: string): void {
  routes.set(key(method, path), () => {
    throw new TypeError('Failed to fetch')
  })
}

export function callCount(method: string, path: string): number {
  return calls.filter((c) => c.method === method.toUpperCase() && c.path === path).length
}

export function lastInit(method: string, path: string): RequestInit | undefined {
  return calls.filter((c) => c.method === method.toUpperCase() && c.path === path).at(-1)?.init
}

export function installFetchMock(): void {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const raw = typeof input === 'string' ? input : input.toString()
    const path = raw.startsWith('http') ? new URL(raw).pathname : raw.split('?')[0]
    const method = (init.method ?? 'GET').toUpperCase()
    calls.push({ method, path, init })
    const responder = routes.get(key(method, path))
    if (!responder) throw new Error(`No mock route for ${method} ${path}`)
    return responder({ method, path, init })
  }) as unknown as typeof fetch
}

export function resetFetchMock(): void {
  routes.clear()
  calls.length = 0
  vi.restoreAllMocks()
}
