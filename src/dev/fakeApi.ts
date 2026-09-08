import { env } from '@/config/env'
import { decodeJwt, isExpired, type JwtClaims } from '@/lib/auth/jwt'
import type { Role } from '@/lib/rbac/permissions'

/**
 * Dev-only in-app HTTP transport shim — the `fetch` analogue of
 * `src/lib/mqtt/client.ts` + `src/test/fakeMqtt.ts` (`VITE_MQTT_TRANSPORT=fake`).
 * Installed only when `VITE_API_TRANSPORT=fake` (see `src/main.tsx`), and always
 * dynamically imported so it never reaches a production bundle.
 *
 * This is NOT a server. Nothing listens on a port and no process is spawned;
 * it answers `globalThis.fetch` calls in-memory, in the same JS realm as the
 * app, so the owner can log in and click around with no backend running at
 * all. `src/lib/http/client.ts` is unaware this exists — it just gets back
 * real `Response` objects.
 */

type SeedUser = {
  id: string
  email: string
  name: string
  password: string
  roles: Role[]
}

type Device = {
  id: string
  name: string
  location: string
  firmware: string
}

const LATENCY_MS = 120

const DEFAULT_ACCESS_TTL_SECONDS = 15 * 60
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60

function accessTtlSeconds(): number {
  const raw = (import.meta.env as Record<string, string | undefined>).VITE_FAKE_ACCESS_TTL_SECONDS
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ACCESS_TTL_SECONDS
}

// Seed accounts — all password "password". Roles must match the keys of
// ROLE_PERMISSIONS in src/lib/rbac/permissions.ts exactly.
const users: SeedUser[] = [
  { id: 'u1', email: 'admin@example.com', name: 'Ada Admin', password: 'password', roles: ['admin'] },
  { id: 'u2', email: 'operator@example.com', name: 'Otto Operator', password: 'password', roles: ['operator'] },
  { id: 'u3', email: 'viewer@example.com', name: 'Vera Viewer', password: 'password', roles: ['viewer'] },
]

let devices: Device[] = [
  { id: 'd1', name: 'Line Sensor 1', location: 'Building A — Floor 1', firmware: '1.4.2' },
  { id: 'd2', name: 'Line Sensor 2', location: 'Building A — Floor 2', firmware: '1.4.2' },
  { id: 'd3', name: 'Gateway', location: 'Building B — Roof', firmware: '2.0.1' },
]

// ---- JWT minting ----------------------------------------------------------

function base64UrlEncode(input: string): string {
  // Encode to UTF-8 bytes first so non-ASCII claims (names, emails) survive
  // `btoa`, which only accepts a "binary string" (one byte per code unit).
  const bytes = new TextEncoder().encode(input)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// This is a fixed placeholder, not a signing reference. The frontend never
// verifies a JWT signature — it cannot hold the signing secret, and
// `src/lib/auth/jwt.ts` reads the payload only — so a real HMAC signature
// would be security theatre here, not a shortcut. Do not copy this pattern
// into anything that touches a real backend.
const DUMMY_SIGNATURE = 'dev-fake-signature'

function mintJwt(user: SeedUser, ttlSeconds: number): string {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'none', typ: 'JWT' }
  const payload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    roles: user.roles,
    iat: now,
    exp: now + ttlSeconds,
  }
  return [base64UrlEncode(JSON.stringify(header)), base64UrlEncode(JSON.stringify(payload)), DUMMY_SIGNATURE].join(
    '.',
  )
}

function tokenPairFor(user: SeedUser): { accessToken: string; refreshToken: string } {
  return {
    accessToken: mintJwt(user, accessTtlSeconds()),
    refreshToken: mintJwt(user, REFRESH_TTL_SECONDS),
  }
}

// ---- request helpers --------------------------------------------------

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function noContent(): Response {
  return new Response(null, { status: 204 })
}

function parseBody(init: RequestInit | undefined): Record<string, unknown> {
  if (typeof init?.body !== 'string') return {}
  try {
    const parsed: unknown = JSON.parse(init.body)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function toUrlString(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

/** Reads and validates the bearer token. `null` means "answer 401". */
function authenticate(init: RequestInit | undefined): JwtClaims | null {
  const headers = new Headers(init?.headers)
  const authHeader = headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice('Bearer '.length)
  const claims = decodeJwt(token)
  if (!claims || isExpired(claims)) return null
  return claims
}

function hasAnyRole(claims: JwtClaims, roles: Role[]): boolean {
  const allowed: readonly string[] = roles
  return claims.roles.some((role) => allowed.includes(role))
}

function sanitizeUser(user: SeedUser): Omit<SeedUser, 'password'> {
  const { password: _password, ...rest } = user
  return rest
}

/**
 * Routes one request. Returns `null` for anything it does not recognise, so
 * the caller falls through to the real `fetch` instead of hanging or
 * returning a confusing 200.
 */
function route(method: string, path: string, init: RequestInit | undefined): Response | null {
  if (method === 'POST' && path === '/auth/login') {
    const body = parseBody(init)
    const user = users.find((u) => u.email === body.email && u.password === body.password)
    if (!user) return json({ error: 'invalid credentials' }, 401)
    return json(tokenPairFor(user))
  }

  if (method === 'POST' && path === '/auth/refresh') {
    const body = parseBody(init)
    const refreshToken = typeof body.refreshToken === 'string' ? body.refreshToken : null
    const claims = refreshToken ? decodeJwt(refreshToken) : null
    if (!claims || isExpired(claims)) return json({ error: 'invalid refresh token' }, 401)
    const user = users.find((u) => u.id === claims.sub)
    if (!user) return json({ error: 'invalid refresh token' }, 401)
    return json(tokenPairFor(user))
  }

  if (method === 'POST' && path === '/auth/logout') return noContent()

  if (method === 'GET' && path === '/devices') {
    const claims = authenticate(init)
    if (!claims) return json({ error: 'unauthorized' }, 401)
    return json(devices)
  }

  if (method === 'GET' && path === '/users') {
    const claims = authenticate(init)
    if (!claims) return json({ error: 'unauthorized' }, 401)
    if (!hasAnyRole(claims, ['admin'])) return json({ error: 'forbidden' }, 403)
    return json(users.map(sanitizeUser))
  }

  const deviceMatch = /^\/devices\/([^/]+)$/.exec(path)
  if (deviceMatch) {
    const id = deviceMatch[1]

    if (method === 'GET') {
      const claims = authenticate(init)
      if (!claims) return json({ error: 'unauthorized' }, 401)
      const device = devices.find((d) => d.id === id)
      return device ? json(device) : json({ error: 'not found' }, 404)
    }

    if (method === 'PATCH') {
      const claims = authenticate(init)
      if (!claims) return json({ error: 'unauthorized' }, 401)
      if (!hasAnyRole(claims, ['admin', 'operator'])) return json({ error: 'forbidden' }, 403)
      const index = devices.findIndex((d) => d.id === id)
      if (index === -1) return json({ error: 'not found' }, 404)
      const patch = parseBody(init)
      devices[index] = { ...devices[index], ...patch }
      return json(devices[index])
    }

    if (method === 'DELETE') {
      const claims = authenticate(init)
      if (!claims) return json({ error: 'unauthorized' }, 401)
      if (!hasAnyRole(claims, ['admin'])) return json({ error: 'forbidden' }, 403)
      const index = devices.findIndex((d) => d.id === id)
      if (index === -1) return json({ error: 'not found' }, 404)
      devices = devices.filter((d) => d.id !== id)
      return noContent()
    }
  }

  return null
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Swaps `globalThis.fetch` for the shim. Requests whose URL does not start
 * with `env.API_URL`, and any request under it that no route recognises, are
 * delegated to the original `fetch` unchanged.
 */
export function installFakeApi(): void {
  const originalFetch = globalThis.fetch.bind(globalThis)

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const rawUrl = toUrlString(input)
    if (!rawUrl.startsWith(env.API_URL)) return originalFetch(input, init)

    const path = rawUrl.slice(env.API_URL.length)
    const method = (init?.method ?? 'GET').toUpperCase()

    const response = route(method, path, init)
    if (!response) return originalFetch(input, init)

    await delay(LATENCY_MS)
    return response
  }

  console.log(
    '[fakeApi] installed — no backend running. Log in with:\n' +
      '  admin@example.com / password    (admin)\n' +
      '  operator@example.com / password (operator)\n' +
      '  viewer@example.com / password   (viewer)',
  )
}
