import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { installFetchMock, mockRoute, resetFetchMock } from '@/test/http'
import { authStore } from '@/lib/auth/store'
import { renderRoute, signIn } from '@/test/router'

beforeEach(() => {
  installFetchMock()
  authStore.getState().setUnauthenticated()
  mockRoute('GET', '/api/users', {
    body: [{ id: 'u1', email: 'a@b.co', name: 'Ann', roles: ['admin'] }],
  })
})
afterEach(() => resetFetchMock())

describe('/admin/users', () => {
  it('renders the user table for an admin', async () => {
    signIn(['admin'])
    renderRoute('/admin/users')
    expect(await screen.findByRole('heading', { name: 'Users' })).toBeInTheDocument()
    expect(await screen.findByText('a@b.co')).toBeInTheDocument()
  })

  it('redirects an operator to /forbidden', async () => {
    signIn(['operator'])
    const { router } = renderRoute('/admin/users')
    await waitFor(() => expect(router.state.location.pathname).toBe('/forbidden'))
  })

  it('redirects a viewer to /forbidden', async () => {
    signIn(['viewer'])
    const { router } = renderRoute('/admin/users')
    await waitFor(() => expect(router.state.location.pathname).toBe('/forbidden'))
  })

  it('does not fetch users when the guard rejects', async () => {
    signIn(['viewer'])
    const { router } = renderRoute('/admin/users')
    await waitFor(() => expect(router.state.location.pathname).toBe('/forbidden'))
    const { callCount } = await import('@/test/http')
    expect(callCount('GET', '/api/users')).toBe(0)
  })
})
