import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installFetchMock, mockRoute, resetFetchMock } from '@/test/http'
import { authStore } from '@/lib/auth/store'
import { renderRoute, signIn } from '@/test/router'

beforeEach(() => authStore.getState().setUnauthenticated())

describe('route guards end to end', () => {
  it('sends an unauthenticated visitor from / to the login page', async () => {
    const { router } = renderRoute('/')
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })

  // Task 17 adds the /devices/$id route and un-skips this test.
  it.skip('preserves the attempted path in the redirect search param', async () => {
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
  afterEach(() => resetFetchMock())

  // Task 17 adds the /devices/$id route and un-skips this test. Until then,
  // /devices/42 lands on the 404 page instead of the guarded route.
  it.skip('returns the user to the page they originally asked for', async () => {
    mockRoute('POST', '/api/auth/login', { status: 204 })
    mockRoute('GET', '/api/auth/me', {
      body: { user: { id: 'u1', email: 'a@b.co', name: 'Ann', roles: ['admin'] } },
    })
    const { router } = renderRoute('/devices/42')
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))

    await userEvent.type(await screen.findByLabelText('Email'), 'a@b.co')
    await userEvent.type(screen.getByLabelText('Password'), 'pw')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/devices/42'))
  })
})
