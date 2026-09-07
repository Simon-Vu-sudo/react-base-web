import { describe, expect, it } from 'vitest'
import { safeRedirect } from './safeRedirect'

describe('safeRedirect', () => {
  it('passes through a relative path', () => {
    expect(safeRedirect('/devices/42')).toBe('/devices/42')
  })

  it('keeps a query string and hash', () => {
    expect(safeRedirect('/devices?tab=live#top')).toBe('/devices?tab=live#top')
  })

  it('rejects an absolute URL', () => {
    expect(safeRedirect('https://evil.example.com/phish')).toBe('/')
  })

  it('rejects a protocol-relative URL', () => {
    expect(safeRedirect('//evil.example.com')).toBe('/')
  })

  it('rejects a backslash-obfuscated URL', () => {
    expect(safeRedirect('/\\evil.example.com')).toBe('/')
  })

  it('rejects a javascript: scheme', () => {
    expect(safeRedirect('javascript:alert(1)')).toBe('/')
  })

  it('rejects a non-string', () => {
    expect(safeRedirect(undefined)).toBe('/')
    expect(safeRedirect(42)).toBe('/')
  })
})
