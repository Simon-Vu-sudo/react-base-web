import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFetchMock, mockNetworkError, mockRoute, resetFetchMock } from '@/test/http'
import { PERMISSIONS } from '@/lib/rbac/permissions'
import { authStore } from './store'
import { bootstrap, login, logout, registerLogoutHandler, resyncSession, clearLogoutHandlers } from './service'

const user = { id: 'u1', email: 'a@b.co', name: 'Ann', roles: ['admin'] }

beforeEach(() => {
  installFetchMock()
  authStore.setState({ status: 'loading', user: null, permissions: new Set() })
})
afterEach(() => {
  resetFetchMock()
  clearLogoutHandlers()
})

describe('bootstrap', () => {
  it('authenticates on 200 and resolves permissions', async () => {
    mockRoute('GET', '/api/auth/me', { body: { user } })
    await bootstrap()
    const s = authStore.getState()
    expect(s.status).toBe('authenticated')
    expect(s.user).toEqual(user)
    expect(s.permissions.has(PERMISSIONS.USER_MANAGE)).toBe(true)
  })

  it('marks unauthenticated on 401', async () => {
    mockRoute('GET', '/api/auth/me', { status: 401 })
    await bootstrap()
    expect(authStore.getState().status).toBe('unauthenticated')
  })

  it('marks bootstrapError on a network failure, NOT unauthenticated', async () => {
    mockNetworkError('GET', '/api/auth/me')
    await bootstrap()
    expect(authStore.getState().status).toBe('bootstrapError')
  })

  it('marks bootstrapError on a 500', async () => {
    mockRoute('GET', '/api/auth/me', { status: 500 })
    await bootstrap()
    expect(authStore.getState().status).toBe('bootstrapError')
  })

  it('never throws, so the app can always render', async () => {
    mockNetworkError('GET', '/api/auth/me')
    await expect(bootstrap()).resolves.toBeUndefined()
  })
})

describe('login', () => {
  it('sets the session from the login response body', async () => {
    mockRoute('POST', '/api/auth/login', { body: { user } })
    await login({ email: 'a@b.co', password: 'pw' })
    expect(authStore.getState().status).toBe('authenticated')
    expect(authStore.getState().user).toEqual(user)
  })

  it('falls back to /auth/me when login returns no body', async () => {
    mockRoute('POST', '/api/auth/login', { status: 204 })
    mockRoute('GET', '/api/auth/me', { body: { user } })
    await login({ email: 'a@b.co', password: 'pw' })
    expect(authStore.getState().user).toEqual(user)
  })

  it('propagates a 401 and leaves the store unauthenticated', async () => {
    mockRoute('POST', '/api/auth/login', { status: 401, body: { message: 'nope' } })
    await expect(login({ email: 'a@b.co', password: 'bad' })).rejects.toMatchObject({
      status: 401,
    })
    expect(authStore.getState().status).not.toBe('authenticated')
  })
})

describe('logout', () => {
  it('clears the session and runs registered handlers', async () => {
    const handler = vi.fn()
    registerLogoutHandler(handler)
    authStore.getState().setSession(user)
    mockRoute('POST', '/api/auth/logout', { status: 204 })

    await logout()

    expect(authStore.getState().status).toBe('unauthenticated')
    expect(authStore.getState().user).toBeNull()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('still clears local state when the server call fails', async () => {
    authStore.getState().setSession(user)
    mockNetworkError('POST', '/api/auth/logout')
    await logout()
    expect(authStore.getState().status).toBe('unauthenticated')
  })
})

describe('resyncSession', () => {
  it('updates the session from a fresh /auth/me', async () => {
    authStore.getState().setSession({ ...user, roles: ['viewer'] })
    mockRoute('GET', '/api/auth/me', { body: { user: { ...user, roles: ['admin'] } } })

    await resyncSession()

    expect(authStore.getState().user?.roles).toEqual(['admin'])
    expect(authStore.getState().permissions.has(PERMISSIONS.USER_MANAGE)).toBe(true)
  })

  it('swallows a failure without throwing or corrupting the session', async () => {
    authStore.getState().setSession(user)
    mockNetworkError('GET', '/api/auth/me')

    await expect(resyncSession()).resolves.toBeUndefined()
    expect(authStore.getState().status).toBe('authenticated')
  })
})
