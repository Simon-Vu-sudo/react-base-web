import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installFetchMock, mockRoute, resetFetchMock } from '@/test/http'
import { authStore } from '@/lib/auth/store'
import { clearTokens } from '@/lib/auth/tokenStore'
import { renderRoute, signIn } from '@/test/router'

/** Base64url-encodes a JSON payload the way a real JWT segment would be. */
function encodeSegment(value: unknown): string {
  const json = JSON.stringify(value)
  const bytes = new TextEncoder().encode(json)
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('')
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function makeJwt(claims: Record<string, unknown>): string {
  return `${encodeSegment({ alg: 'HS256', typ: 'JWT' })}.${encodeSegment(claims)}.sig`
}

const accessToken = makeJwt({
  sub: 'u1',
  email: 'a@b.co',
  name: 'Ann',
  roles: ['admin'],
  exp: Math.floor(Date.now() / 1000) + 3600,
})

beforeEach(() => {
  authStore.getState().setUnauthenticated()
  clearTokens()
})

describe('route guards end to end', () => {
  it('sends an unauthenticated visitor from / to the login page', async () => {
    const { router } = renderRoute('/')
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })

  it('preserves the attempted path in the redirect search param', async () => {
    const { router } = renderRoute('/devices/42')
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(router.state.location.search).toMatchObject({ redirect: '/devices/42' })
  })

  it('renders the dashboard for an authenticated user', async () => {
    signIn(['viewer'])
    renderRoute('/')
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('bounces an authenticated user away from /login', async () => {
    signIn(['viewer'])
    const { router } = renderRoute('/login')
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('renders the bare 404 page for an unknown URL', async () => {
    signIn(['viewer'])
    renderRoute('/no-such-page')
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })

  it('renders the forbidden page inside the authenticated area', async () => {
    signIn(['viewer'])
    renderRoute('/forbidden')
    expect(await screen.findByRole('heading', { name: 'Not permitted' })).toBeInTheDocument()
  })
})

describe('login redirect bounce', () => {
  beforeEach(() => installFetchMock())
  afterEach(() => {
    resetFetchMock()
    clearTokens()
  })

  it('returns the user to the page they originally asked for', async () => {
    mockRoute('POST', '/api/auth/login', { body: { accessToken, refreshToken: 'r1' } })
    mockRoute('GET', '/api/devices/42', {
      body: { id: '42', name: 'Boiler', location: 'Plant A', firmware: '1.0.0' },
    })
    const { router } = renderRoute('/devices/42')
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))

    await userEvent.type(await screen.findByLabelText('Email'), 'a@b.co')
    await userEvent.type(screen.getByLabelText('Password'), 'pw')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/devices/42'))
  })
})
