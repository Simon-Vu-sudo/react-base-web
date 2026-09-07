import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  callCount,
  installFetchMock,
  lastInit,
  mockNetworkError,
  mockRoute,
  resetFetchMock,
} from '@/test/http'
import { HttpError, apiFetch, setHttpHooks } from './client'

beforeEach(() => installFetchMock())
afterEach(() => resetFetchMock())

describe('apiFetch happy path', () => {
  it('returns parsed JSON', async () => {
    mockRoute('GET', '/api/devices', { body: [{ id: 'd1' }] })
    await expect(apiFetch('/devices')).resolves.toEqual([{ id: 'd1' }])
  })

  it('always sends credentials and never an Authorization header', async () => {
    mockRoute('GET', '/api/devices', { body: [] })
    await apiFetch('/devices')
    const init = lastInit('GET', '/api/devices')
    expect(init?.credentials).toBe('include')
    expect(new Headers(init?.headers).has('authorization')).toBe(false)
  })

  it('returns undefined for 204', async () => {
    mockRoute('POST', '/api/devices/d1/reboot', { status: 204 })
    await expect(apiFetch('/devices/d1/reboot', { method: 'POST' })).resolves.toBeUndefined()
  })

  it('throws HttpError carrying status and body on 500', async () => {
    mockRoute('GET', '/api/devices', { status: 500, body: { message: 'boom' } })
    await expect(apiFetch('/devices')).rejects.toMatchObject({
      status: 500,
      body: { message: 'boom' },
    })
    await expect(apiFetch('/devices')).rejects.toBeInstanceOf(HttpError)
  })

  it('throws HttpError with the raw text when the error body is not JSON', async () => {
    mockRoute(
      'GET',
      '/api/devices',
      () => new Response('<html>Internal Server Error</html>', { status: 500 }),
    )
    await expect(apiFetch('/devices')).rejects.toMatchObject({
      status: 500,
      body: '<html>Internal Server Error</html>',
    })
  })
})

describe('apiFetch refresh behaviour', () => {
  it('fires exactly one refresh for two concurrent 401s', async () => {
    let devicesCalls = 0
    mockRoute('GET', '/api/devices', () => {
      devicesCalls += 1
      // First call from each of the two concurrent requests gets a 401.
      return devicesCalls <= 2
        ? new Response(null, { status: 401 })
        : new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
    })
    mockRoute('POST', '/api/auth/refresh', { status: 200 })

    const [a, b] = await Promise.all([apiFetch('/devices'), apiFetch('/devices')])

    expect(callCount('POST', '/api/auth/refresh')).toBe(1)
    expect(a).toEqual([])
    expect(b).toEqual([])
  })

  it('replays the original request exactly once', async () => {
    let n = 0
    mockRoute('GET', '/api/me/settings', () => {
      n += 1
      return n === 1
        ? new Response(null, { status: 401 })
        : new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
    })
    mockRoute('POST', '/api/auth/refresh', { status: 200 })

    await expect(apiFetch('/me/settings')).resolves.toEqual({ ok: true })
    expect(callCount('GET', '/api/me/settings')).toBe(2)
  })

  it('does not retry a second time when the replay also 401s', async () => {
    mockRoute('GET', '/api/devices', { status: 401 })
    mockRoute('POST', '/api/auth/refresh', { status: 200 })

    await expect(apiFetch('/devices')).rejects.toMatchObject({ status: 401 })
    expect(callCount('GET', '/api/devices')).toBe(2)
    expect(callCount('POST', '/api/auth/refresh')).toBe(1)
  })

  it('does not intercept a 401 on an /auth/ path', async () => {
    mockRoute('POST', '/api/auth/login', { status: 401 })

    await expect(
      apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({}) }),
    ).rejects.toMatchObject({ status: 401 })
    expect(callCount('POST', '/api/auth/refresh')).toBe(0)
  })

  it('calls onRefreshFailed and rejects when the refresh fails', async () => {
    const onRefreshFailed = vi.fn()
    setHttpHooks({ onRefreshFailed })
    mockRoute('GET', '/api/devices', { status: 401 })
    mockRoute('POST', '/api/auth/refresh', { status: 401 })

    await expect(apiFetch('/devices')).rejects.toMatchObject({ status: 401 })
    expect(onRefreshFailed).toHaveBeenCalledTimes(1)
    expect(callCount('GET', '/api/devices')).toBe(1)
    setHttpHooks({ onRefreshFailed: () => {} })
  })

  it('allows a fresh refresh after an earlier one settled', async () => {
    let n = 0
    mockRoute('GET', '/api/devices', () => {
      n += 1
      return n % 2 === 1
        ? new Response(null, { status: 401 })
        : new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
    })
    mockRoute('POST', '/api/auth/refresh', { status: 200 })

    await apiFetch('/devices')
    await apiFetch('/devices')
    expect(callCount('POST', '/api/auth/refresh')).toBe(2)
  })

  it('calls onRefreshFailed and rejects when the refresh request itself errors', async () => {
    const onRefreshFailed = vi.fn()
    setHttpHooks({ onRefreshFailed })
    mockRoute('GET', '/api/devices', { status: 401 })
    mockNetworkError('POST', '/api/auth/refresh')

    await expect(apiFetch('/devices')).rejects.toMatchObject({ status: 401 })
    expect(onRefreshFailed).toHaveBeenCalledTimes(1)
    expect(callCount('GET', '/api/devices')).toBe(1)
    setHttpHooks({ onRefreshFailed: () => {} })
  })
})

describe('apiFetch 403 handling', () => {
  it('calls onForbidden so permissions can be resynced', async () => {
    const onForbidden = vi.fn()
    setHttpHooks({ onForbidden })
    mockRoute('DELETE', '/api/devices/d1', { status: 403 })

    await expect(apiFetch('/devices/d1', { method: 'DELETE' })).rejects.toMatchObject({
      status: 403,
    })
    expect(onForbidden).toHaveBeenCalledTimes(1)
    setHttpHooks({ onForbidden: () => {} })
  })
})

describe('apiFetch network errors', () => {
  it('propagates a network failure as-is', async () => {
    mockNetworkError('GET', '/api/devices')
    await expect(apiFetch('/devices')).rejects.toThrow(/Failed to fetch/)
  })
})
