import { describe, expect, it } from 'vitest'
import { PERMISSIONS, type Permission } from '@/lib/rbac/permissions'
import { NAV_ITEMS, visibleNavItems } from './nav'

const canFrom = (held: Permission[]) => (p: Permission) => held.includes(p)

describe('visibleNavItems', () => {
  it('always shows items with no permission requirement', () => {
    const labels = visibleNavItems(canFrom([])).map((i) => i.label)
    expect(labels).toContain('Dashboard')
  })

  it('hides Devices from a user without device.view', () => {
    const labels = visibleNavItems(canFrom([])).map((i) => i.label)
    expect(labels).not.toContain('Devices')
  })

  it('shows Devices but not Admin for an operator', () => {
    const labels = visibleNavItems(
      canFrom([PERMISSIONS.DEVICE_VIEW, PERMISSIONS.DEVICE_WRITE]),
    ).map((i) => i.label)
    expect(labels).toContain('Devices')
    expect(labels).not.toContain('Users')
  })

  it('shows every item to an admin', () => {
    const all = Object.values(PERMISSIONS)
    expect(visibleNavItems(canFrom(all))).toHaveLength(NAV_ITEMS.length)
  })
})
