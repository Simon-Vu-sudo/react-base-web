import { describe, expect, it } from 'vitest'
import { decodeJwt, isExpired } from './jwt'

/** Base64url-encodes a JSON payload the way a real JWT segment would be. */
function encodeSegment(value: unknown): string {
  const json = typeof value === 'string' ? value : JSON.stringify(value)
  const bytes = new TextEncoder().encode(json)
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('')
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function makeToken(payload: unknown, header: unknown = { alg: 'HS256', typ: 'JWT' }): string {
  return `${encodeSegment(header)}.${encodeSegment(payload)}.signature-not-checked`
}

const validClaims = {
  sub: 'u1',
  email: 'a@b.co',
  name: 'Ann',
  roles: ['admin'],
  exp: 9_999_999_999,
}

describe('decodeJwt', () => {
  it('decodes valid claims from a well-formed token', () => {
    expect(decodeJwt(makeToken(validClaims))).toEqual(validClaims)
  })

  it('supports non-ASCII characters in claims', () => {
    const claims = { ...validClaims, name: 'Ánn Ñ' }
    expect(decodeJwt(makeToken(claims))?.name).toBe('Ánn Ñ')
  })

  it('returns null for a token that does not have three segments', () => {
    expect(decodeJwt('only.two')).toBeNull()
    expect(decodeJwt('one-segment')).toBeNull()
    expect(decodeJwt('a.b.c.d')).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(decodeJwt('')).toBeNull()
  })

  it('returns null for a non-string input', () => {
    // @ts-expect-error deliberately testing runtime robustness for bad input
    expect(decodeJwt(null)).toBeNull()
    // @ts-expect-error deliberately testing runtime robustness for bad input
    expect(decodeJwt(undefined)).toBeNull()
  })

  it('returns null for a payload segment that is not valid base64', () => {
    expect(decodeJwt('header.!!!not-base64!!!.sig')).toBeNull()
  })

  it('returns null when the decoded payload is not JSON', () => {
    const notJson = encodeSegment('this is not json {')
    expect(decodeJwt(`header.${notJson}.sig`)).toBeNull()
  })

  it('returns null when the payload is JSON but not an object', () => {
    expect(decodeJwt(makeToken(42))).toBeNull()
    expect(decodeJwt(makeToken('a string'))).toBeNull()
    expect(decodeJwt(makeToken(null))).toBeNull()
  })

  it('returns null when a required claim is missing', () => {
    const { sub: _sub, ...withoutSub } = validClaims
    void _sub
    expect(decodeJwt(makeToken(withoutSub))).toBeNull()
  })

  it('returns null when roles is not an array of strings', () => {
    expect(decodeJwt(makeToken({ ...validClaims, roles: 'admin' }))).toBeNull()
    expect(decodeJwt(makeToken({ ...validClaims, roles: [1, 2] }))).toBeNull()
  })

  it('returns null when exp is not a number', () => {
    expect(decodeJwt(makeToken({ ...validClaims, exp: '9999999999' }))).toBeNull()
  })

  it('never throws for garbage input', () => {
    expect(() => decodeJwt('not a jwt at all')).not.toThrow()
    expect(() => decodeJwt('..')).not.toThrow()
  })
})

describe('isExpired', () => {
  it('is false when exp is in the future', () => {
    expect(isExpired({ ...validClaims, exp: Math.floor(Date.now() / 1000) + 3600 })).toBe(false)
  })

  it('is true when exp is in the past', () => {
    expect(isExpired({ ...validClaims, exp: Math.floor(Date.now() / 1000) - 3600 })).toBe(true)
  })

  it('treats exp exactly at now as expired', () => {
    const nowSeconds = 1_000
    expect(isExpired({ ...validClaims, exp: nowSeconds }, nowSeconds * 1000)).toBe(true)
  })

  it('accepts an explicit now for deterministic testing', () => {
    const claims = { ...validClaims, exp: 1000 }
    expect(isExpired(claims, 999_000)).toBe(false)
    expect(isExpired(claims, 1_000_001)).toBe(true)
  })
})
