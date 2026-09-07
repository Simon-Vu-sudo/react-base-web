import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callCount, installFetchMock, mockNetworkError, mockRoute, resetFetchMock } from '@/test/http'
import { PERMISSIONS } from '@/lib/rbac/permissions'
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from './tokenStore'
import { authStore } from './store'
import { bootstrap, login, logout, registerLogoutHandler, resyncSession, clearLogoutHandlers } from './service'

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

const FUTURE_EXP = Math.floor(Date.now() / 1000) + 3600
const PAST_EXP = Math.floor(Date.now() / 1000) - 3600

const claims = { sub: 'u1', email: 'a@b.co', name: 'Ann', roles: ['admin'], exp: FUTURE_EXP }
const accessToken = makeJwt(claims)
const user = { id: 'u1', email: 'a@b.co', name: 'Ann', roles: ['admin'] }

beforeEach(() => {
  installFetchMock()
  authStore.setState({ status: 'loading', user: null, permissions: new Set() })
  clearTokens()
})
afterEach(() => {
  resetFetchMock()
  clearLogoutHandlers()
  clearTokens()
})

describe('bootstrap', () => {
  it('is unauthenticated when there is no stored access token', async () => {
    await bootstrap()
    expect(authStore.getState().status).toBe('unauthenticated')
    expect(callCount('POST', '/api/auth/refresh')).toBe(0)
  })

  it('authenticates from a valid, unexpired access token without any network call', async () => {
    setTokens({ accessToken, refreshToken: 'r1' })
    await bootstrap()
    const s = authStore.getState()
    expect(s.status).toBe('authenticated')
    expect(s.user).toEqual(user)
    expect(s.permissions.has(PERMISSIONS.USER_MANAGE)).toBe(true)
    expect(callCount('POST', '/api/auth/refresh')).toBe(0)
  })

  it('clears storage and marks unauthenticated when the stored token is undecodable', async () => {
    setTokens({ accessToken: 'not-a-jwt', refreshToken: 'r1' })
    await bootstrap()
    expect(authStore.getState().status).toBe('unauthenticated')
    expect(getAccessToken()).toBeNull()
  })

  it('refreshes an expired token and authenticates with the new claims', async () => {
    const expiredToken = makeJwt({ ...claims, exp: PAST_EXP })
    setTokens({ accessToken: expiredToken, refreshToken: 'r1' })
    const newClaims = { ...claims, roles: ['viewer'] }
    const newAccessToken = makeJwt(newClaims)
    mockRoute('POST', '/api/auth/refresh', {
      body: { accessToken: newAccessToken, refreshToken: 'r2' },
    })

    await bootstrap()

    expect(authStore.getState().status).toBe('authenticated')
    expect(authStore.getState().user?.roles).toEqual(['viewer'])
    expect(getAccessToken()).toBe(newAccessToken)
    expect(getRefreshToken()).toBe('r2')
  })

  it('marks unauthenticated (not bootstrapError) when refreshing an expired token gets a 401', async () => {
    const expiredToken = makeJwt({ ...claims, exp: PAST_EXP })
    setTokens({ accessToken: expiredToken, refreshToken: 'dead' })
    mockRoute('POST', '/api/auth/refresh', { status: 401 })

    await bootstrap()

    expect(authStore.getState().status).toBe('unauthenticated')
    expect(getAccessToken()).toBeNull()
  })

  it('marks bootstrapError (NOT unauthenticated) when the refresh call cannot reach the server', async () => {
    const expiredToken = makeJwt({ ...claims, exp: PAST_EXP })
    setTokens({ accessToken: expiredToken, refreshToken: 'r1' })
    mockNetworkError('POST', '/api/auth/refresh')

    await bootstrap()

    expect(authStore.getState().status).toBe('bootstrapError')
  })

  it('marks unauthenticated when the token is expired and there is no refresh token', async () => {
    const expiredToken = makeJwt({ ...claims, exp: PAST_EXP })
    setTokens({ accessToken: expiredToken, refreshToken: '' })
    await bootstrap()
    expect(authStore.getState().status).toBe('unauthenticated')
  })

  it('never throws, so the app can always render', async () => {
    const expiredToken = makeJwt({ ...claims, exp: PAST_EXP })
    setTokens({ accessToken: expiredToken, refreshToken: 'r1' })
    mockNetworkError('POST', '/api/auth/refresh')
    await expect(bootstrap()).resolves.toBeUndefined()
  })
})

describe('login', () => {
  it('stores the tokens and decodes identity from the access token', async () => {
    mockRoute('POST', '/api/auth/login', { body: { accessToken, refreshToken: 'r1' } })
    await login({ email: 'a@b.co', password: 'pw' })
    expect(authStore.getState().status).toBe('authenticated')
    expect(authStore.getState().user).toEqual(user)
    expect(getAccessToken()).toBe(accessToken)
    expect(getRefreshToken()).toBe('r1')
  })

  it('propagates a 401 and leaves the store unauthenticated', async () => {
    mockRoute('POST', '/api/auth/login', { status: 401, body: { message: 'nope' } })
    await expect(login({ email: 'a@b.co', password: 'bad' })).rejects.toMatchObject({
      status: 401,
    })
    expect(authStore.getState().status).not.toBe('authenticated')
    expect(getAccessToken()).toBeNull()
  })
})

describe('logout', () => {
  it('clears tokens and the session, and runs registered handlers', async () => {
    const handler = vi.fn()
    registerLogoutHandler(handler)
    setTokens({ accessToken, refreshToken: 'r1' })
    authStore.getState().setSession(user)
    mockRoute('POST', '/api/auth/logout', { status: 204 })

    await logout()

    expect(authStore.getState().status).toBe('unauthenticated')
    expect(authStore.getState().user).toBeNull()
    expect(getAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('still clears local state when the server call fails', async () => {
    setTokens({ accessToken, refreshToken: 'r1' })
    authStore.getState().setSession(user)
    mockNetworkError('POST', '/api/auth/logout')
    await logout()
    expect(authStore.getState().status).toBe('unauthenticated')
    expect(getAccessToken()).toBeNull()
  })
})

describe('resyncSession', () => {
  it('forces a refresh and updates the session from the new access token', async () => {
    setTokens({ accessToken, refreshToken: 'r1' })
    authStore.getState().setSession({ ...user, roles: ['viewer'] })
    const promotedToken = makeJwt({ ...claims, roles: ['admin'] })
    mockRoute('POST', '/api/auth/refresh', {
      body: { accessToken: promotedToken, refreshToken: 'r2' },
    })

    await resyncSession()

    expect(authStore.getState().user?.roles).toEqual(['admin'])
    expect(authStore.getState().permissions.has(PERMISSIONS.USER_MANAGE)).toBe(true)
    expect(getAccessToken()).toBe(promotedToken)
  })

  it('swallows a failure without throwing or corrupting the session', async () => {
    setTokens({ accessToken, refreshToken: 'r1' })
    authStore.getState().setSession(user)
    mockNetworkError('POST', '/api/auth/refresh')

    await expect(resyncSession()).resolves.toBeUndefined()
    expect(authStore.getState().status).toBe('authenticated')
    expect(authStore.getState().user).toEqual(user)
  })

  it('does nothing when there is no refresh token to use', async () => {
    authStore.getState().setSession(user)
    await expect(resyncSession()).resolves.toBeUndefined()
    expect(callCount('POST', '/api/auth/refresh')).toBe(0)
    expect(authStore.getState().user).toEqual(user)
  })
})
