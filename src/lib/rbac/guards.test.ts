import { describe, expect, it } from 'vitest'
import { PERMISSIONS, type Permission } from './permissions'
import { requireAnyPermission, requireAuth, requirePermission } from './guards'
import type { GuardArgs } from './guards'

function redirectTarget(thrown: unknown): string | undefined {
  const obj = thrown as { to?: unknown; options?: { to?: unknown } }
  const to = obj?.to ?? obj?.options?.to
  return typeof to === 'string' ? to : undefined
}

function catchThrown(fn: () => void): unknown {
  try {
    fn()
  } catch (e) {
    return e
  }
  return undefined
}

const args = (
  status: 'authenticated' | 'unauthenticated' | 'loading' | 'bootstrapError',
  perms: Permission[] = [],
  href = '/devices/42',
): GuardArgs => ({
  context: { getAuth: () => ({ status, permissions: new Set(perms) }) },
  location: { href },
})

describe('requireAuth', () => {
  it('passes when authenticated', () => {
    expect(() => requireAuth(args('authenticated'))).not.toThrow()
  })

  it('redirects to /login when unauthenticated', () => {
    const thrown = catchThrown(() => requireAuth(args('unauthenticated')))
    expect(thrown).toBeDefined()
    expect(redirectTarget(thrown)).toBe('/login')
  })

  it('carries the attempted path so login can bounce back', () => {
    const thrown = catchThrown(() => requireAuth(args('unauthenticated', [], '/devices/42')))
    expect(JSON.stringify(thrown)).toContain('/devices/42')
  })

  it('redirects when the status is still loading', () => {
    expect(() => requireAuth(args('loading'))).toThrow()
  })
})

describe('requirePermission', () => {
  it('passes when every required permission is held', () => {
    const guard = requirePermission(PERMISSIONS.DEVICE_VIEW, PERMISSIONS.DEVICE_WRITE)
    expect(() =>
      guard(args('authenticated', [PERMISSIONS.DEVICE_VIEW, PERMISSIONS.DEVICE_WRITE])),
    ).not.toThrow()
  })

  it('redirects to /forbidden when one is missing', () => {
    const guard = requirePermission(PERMISSIONS.DEVICE_VIEW, PERMISSIONS.USER_MANAGE)
    const thrown = catchThrown(() => guard(args('authenticated', [PERMISSIONS.DEVICE_VIEW])))
    expect(redirectTarget(thrown)).toBe('/forbidden')
  })

  it('redirects to /forbidden when no permissions are held', () => {
    const guard = requirePermission(PERMISSIONS.DEVICE_VIEW)
    expect(() => guard(args('authenticated', []))).toThrow()
  })
})

describe('requireAnyPermission', () => {
  it('passes when one of several is held', () => {
    const guard = requireAnyPermission(PERMISSIONS.USER_MANAGE, PERMISSIONS.DEVICE_VIEW)
    expect(() => guard(args('authenticated', [PERMISSIONS.DEVICE_VIEW]))).not.toThrow()
  })

  it('redirects to /forbidden when none are held', () => {
    const guard = requireAnyPermission(PERMISSIONS.USER_MANAGE, PERMISSIONS.DEVICE_DELETE)
    const thrown = catchThrown(() => guard(args('authenticated', [PERMISSIONS.DEVICE_VIEW])))
    expect(redirectTarget(thrown)).toBe('/forbidden')
  })
})
