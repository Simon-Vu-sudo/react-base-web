import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from './tokenStore'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('tokenStore', () => {
  it('returns null for both tokens when nothing is stored', () => {
    expect(getAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
  })

  it('persists both tokens under their own keys', () => {
    setTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' })
    expect(getAccessToken()).toBe('access-1')
    expect(getRefreshToken()).toBe('refresh-1')
    expect(localStorage.getItem('auth.accessToken')).toBe('access-1')
    expect(localStorage.getItem('auth.refreshToken')).toBe('refresh-1')
  })

  it('overwrites previously stored tokens', () => {
    setTokens({ accessToken: 'a1', refreshToken: 'r1' })
    setTokens({ accessToken: 'a2', refreshToken: 'r2' })
    expect(getAccessToken()).toBe('a2')
    expect(getRefreshToken()).toBe('r2')
  })

  it('clearTokens removes both entries', () => {
    setTokens({ accessToken: 'a1', refreshToken: 'r1' })
    clearTokens()
    expect(getAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
  })

  it('degrades to null rather than throwing when localStorage.getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked')
    })
    expect(getAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
  })

  it('does not throw when localStorage.setItem throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded')
    })
    expect(() => setTokens({ accessToken: 'a', refreshToken: 'r' })).not.toThrow()
  })

  it('does not throw when localStorage.removeItem throws', () => {
    setTokens({ accessToken: 'a', refreshToken: 'r' })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('blocked')
    })
    expect(() => clearTokens()).not.toThrow()
  })
})
