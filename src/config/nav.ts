import { PERMISSIONS, type Permission } from '@/lib/rbac/permissions'

export type NavItem = {
  to: string
  label: string
  permission?: Permission
}

/**
 * Single source for the sidebar. Filtering here is cosmetic — a user can type
 * any URL — so every entry must also be guarded by its route.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Dashboard' },
  { to: '/devices', label: 'Devices', permission: PERMISSIONS.DEVICE_VIEW },
  { to: '/admin/users', label: 'Users', permission: PERMISSIONS.USER_MANAGE },
]

export function visibleNavItems(can: (p: Permission) => boolean): NavItem[] {
  return NAV_ITEMS.filter((item) => item.permission === undefined || can(item.permission))
}
