export const PERMISSIONS = {
  DEVICE_VIEW: 'device.view',
  DEVICE_WRITE: 'device.write',
  DEVICE_DELETE: 'device.delete',
  USER_VIEW: 'user.view',
  USER_MANAGE: 'user.manage',
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

export const ALL_PERMISSIONS: readonly Permission[] = Object.values(PERMISSIONS)

export const ROLE_PERMISSIONS = {
  admin: ALL_PERMISSIONS,
  operator: [PERMISSIONS.DEVICE_VIEW, PERMISSIONS.DEVICE_WRITE, PERMISSIONS.USER_VIEW],
  viewer: [PERMISSIONS.DEVICE_VIEW],
} satisfies Record<string, readonly Permission[]>

export type Role = keyof typeof ROLE_PERMISSIONS
