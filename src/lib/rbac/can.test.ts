import { describe, expect, it } from 'vitest'
import { PERMISSIONS } from './permissions'
import { can, canAll, canAny } from './can'

const perms = new Set([PERMISSIONS.DEVICE_VIEW, PERMISSIONS.DEVICE_WRITE])

describe('can', () => {
  it('is true for a held permission', () => {
    expect(can(perms, PERMISSIONS.DEVICE_VIEW)).toBe(true)
  })
  it('is false for a permission not held', () => {
    expect(can(perms, PERMISSIONS.USER_MANAGE)).toBe(false)
  })
})

describe('canAll', () => {
  it('is true when every permission is held', () => {
    expect(canAll(perms, [PERMISSIONS.DEVICE_VIEW, PERMISSIONS.DEVICE_WRITE])).toBe(true)
  })
  it('is false when any permission is missing', () => {
    expect(canAll(perms, [PERMISSIONS.DEVICE_VIEW, PERMISSIONS.USER_MANAGE])).toBe(false)
  })
  it('is true for an empty requirement', () => {
    expect(canAll(perms, [])).toBe(true)
  })
})

describe('canAny', () => {
  it('is true when at least one permission is held', () => {
    expect(canAny(perms, [PERMISSIONS.USER_MANAGE, PERMISSIONS.DEVICE_VIEW])).toBe(true)
  })
  it('is false when none are held', () => {
    expect(canAny(perms, [PERMISSIONS.USER_MANAGE, PERMISSIONS.DEVICE_DELETE])).toBe(false)
  })
  it('is false for an empty requirement', () => {
    expect(canAny(perms, [])).toBe(false)
  })
})
