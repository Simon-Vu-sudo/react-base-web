import { afterEach, describe, expect, it } from 'vitest'
import { csrfHeaders, readXsrfToken } from './csrf'

afterEach(() => {
  document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/'
})

describe('readXsrfToken', () => {
  it('extracts the token from a cookie string', () => {
    expect(readXsrfToken('foo=1; XSRF-TOKEN=abc123; bar=2')).toBe('abc123')
  })

  it('URL-decodes the value', () => {
    expect(readXsrfToken('XSRF-TOKEN=a%2Bb%3D')).toBe('a+b=')
  })

  it('returns null when absent', () => {
    expect(readXsrfToken('foo=1')).toBeNull()
  })

  it('does not match a cookie whose name merely ends with the same text', () => {
    expect(readXsrfToken('NOT-XSRF-TOKEN=nope')).toBeNull()
  })

  it('returns null for a malformed percent-sequence instead of throwing', () => {
    expect(() => readXsrfToken('XSRF-TOKEN=%zz')).not.toThrow()
    expect(readXsrfToken('XSRF-TOKEN=%zz')).toBeNull()
  })
})

describe('csrfHeaders', () => {
  it('returns nothing when disabled, even for a mutation', () => {
    document.cookie = 'XSRF-TOKEN=abc123; path=/'
    expect(csrfHeaders('POST', false)).toEqual({})
  })

  it('returns nothing for a safe method when enabled', () => {
    document.cookie = 'XSRF-TOKEN=abc123; path=/'
    expect(csrfHeaders('GET', true)).toEqual({})
    expect(csrfHeaders('HEAD', true)).toEqual({})
  })

  it('sets the header for mutating methods when enabled', () => {
    document.cookie = 'XSRF-TOKEN=abc123; path=/'
    expect(csrfHeaders('POST', true)).toEqual({ 'X-XSRF-TOKEN': 'abc123' })
    expect(csrfHeaders('PATCH', true)).toEqual({ 'X-XSRF-TOKEN': 'abc123' })
    expect(csrfHeaders('DELETE', true)).toEqual({ 'X-XSRF-TOKEN': 'abc123' })
  })

  it('returns nothing when enabled but the cookie is missing', () => {
    expect(csrfHeaders('POST', true)).toEqual({})
  })

  it('treats a lower-case mutating method as mutating', () => {
    document.cookie = 'XSRF-TOKEN=abc123; path=/'
    expect(csrfHeaders('post', true)).toEqual({ 'X-XSRF-TOKEN': 'abc123' })
  })
})
