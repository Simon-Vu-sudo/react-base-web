import { describe, expect, it, vi, afterEach } from 'vitest'
import { PERMISSIONS } from './permissions'
import { resolvePermissions } from './resolve'

afterEach(() => vi.restoreAllMocks())

describe('resolvePermissions', () => {
  it('maps a single role to its permissions', () => {
    expect(resolvePermissions(['viewer'])).toEqual(new Set([PERMISSIONS.DEVICE_VIEW]))
  })

  it('unions permissions across multiple roles without duplicates', () => {
    const perms = resolvePermissions(['viewer', 'operator'])
    expect(perms.has(PERMISSIONS.DEVICE_VIEW)).toBe(true)
    expect(perms.has(PERMISSIONS.DEVICE_WRITE)).toBe(true)
    expect(perms.has(PERMISSIONS.DEVICE_DELETE)).toBe(false)
    expect(perms.size).toBe(3)
  })

  it('gives admin every permission', () => {
    expect(resolvePermissions(['admin']).size).toBe(5)
  })

  it('ignores an unrecognised role instead of throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const perms = resolvePermissions(['viewer', 'supervisor'])
    expect(perms).toEqual(new Set([PERMISSIONS.DEVICE_VIEW]))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('supervisor'))
  })

  it('returns an empty set for no roles', () => {
    expect(resolvePermissions([]).size).toBe(0)
  })
})
