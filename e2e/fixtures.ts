import type { Page } from '@playwright/test'

export type Role = 'admin' | 'operator' | 'viewer'

const USERS: Record<Role, { id: string; email: string; name: string; roles: string[] }> = {
  admin: { id: 'u1', email: 'admin@example.com', name: 'Ada Admin', roles: ['admin'] },
  operator: { id: 'u2', email: 'op@example.com', name: 'Otto Operator', roles: ['operator'] },
  viewer: { id: 'u3', email: 'view@example.com', name: 'Vic Viewer', roles: ['viewer'] },
}

const DEVICES = [
  { id: 'd1', name: 'Boiler', location: 'Plant A', firmware: '1.2.0' },
  { id: 'd2', name: 'Chiller', location: 'Plant B', firmware: '1.1.0' },
]

/**
 * Stubs the whole API surface. `signedIn` controls what /auth/me returns, so a
 * test can start logged out and log in through the real form.
 *
 * `/auth/login` returns 204 with no body — the backend never puts the user or
 * a token on the wire for the frontend to read. Identity comes solely from
 * `/auth/me`, which this fixture gates on the `signedIn` flag so the app's
 * real post-login refetch is what actually surfaces the user.
 */
export async function stubApi(
  page: Page,
  opts: { role?: Role; signedIn?: boolean; loginStatus?: number } = {},
): Promise<void> {
  const role = opts.role ?? 'admin'
  let signedIn = opts.signedIn ?? false
  const user = USERS[role]

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace(/^\/api/, '')
    const method = route.request().method()

    const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers,
        body: JSON.stringify(body),
      })

    if (path === '/auth/login' && method === 'POST') {
      const status = opts.loginStatus ?? 204
      if (status !== 204) return route.fulfill({ status, body: '' })
      signedIn = true
      // Real Set-Cookie header, so the cookie round-trip is genuinely
      // exercised. No body: the session cookie is the only thing that
      // crosses the wire, and /auth/me is what the app calls next.
      return route.fulfill({
        status: 204,
        headers: { 'set-cookie': 'access=fake-access; Path=/; HttpOnly; SameSite=Lax' },
        body: '',
      })
    }

    if (path === '/auth/logout' && method === 'POST') {
      signedIn = false
      return route.fulfill({
        status: 204,
        headers: { 'set-cookie': 'access=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax' },
        body: '',
      })
    }

    if (path === '/auth/me') {
      return signedIn ? json({ user }) : route.fulfill({ status: 401, body: '' })
    }

    if (path === '/devices' && method === 'GET') return json(DEVICES)
    if (path === '/users' && method === 'GET') return json(Object.values(USERS))

    const detail = path.match(/^\/devices\/(.+)$/)
    if (detail) {
      const device = DEVICES.find((d) => d.id === detail[1])
      if (!device) return json({ message: 'not found' }, 404)
      if (method === 'PATCH') return json(device)
      return json(device)
    }

    return json({ message: `unstubbed ${method} ${path}` }, 500)
  })
}

export async function signIn(page: Page, role: Role = 'admin'): Promise<void> {
  await stubApi(page, { role })
  await page.goto('/login')
  await page.getByLabel('Email').fill(USERS[role].email)
  await page.getByLabel('Password').fill('password')
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.getByRole('heading', { name: 'Dashboard' }).waitFor()
}

/** Push a message through the in-memory MQTT transport. */
export async function emitMqtt(page: Page, topic: string, payload: unknown): Promise<void> {
  await page.evaluate(
    ([t, p]) => {
      const fake = (window as unknown as Record<string, { emit: (a: unknown, b: unknown) => void }>)
        .__mqttFake
      fake?.emit(t, p)
    },
    [topic, payload] as const,
  )
}
