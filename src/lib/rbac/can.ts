import type { Permission } from './permissions'

export const can = (perms: ReadonlySet<Permission>, p: Permission): boolean => perms.has(p)

export const canAll = (
  perms: ReadonlySet<Permission>,
  required: readonly Permission[],
): boolean => required.every((p) => perms.has(p))

export const canAny = (
  perms: ReadonlySet<Permission>,
  required: readonly Permission[],
): boolean => required.some((p) => perms.has(p))
