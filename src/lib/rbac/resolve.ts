import { ROLE_PERMISSIONS, type Permission } from './permissions'

/**
 * Resolves the roles the BE sent into the permission set the FE enforces.
 * An unrecognised role is ignored with a dev warning, never thrown: when the
 * BE adds a role before the FE knows about it, the user should get a degraded
 * UI, not a blank screen.
 */
export function resolvePermissions(roles: readonly string[]): Set<Permission> {
  const perms = new Set<Permission>()
  for (const role of roles) {
    const mapped = ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS]
    if (!mapped) {
      if (import.meta.env.DEV) {
        console.warn(`[rbac] Unknown role "${role}" from the server; ignoring it.`)
      }
      continue
    }
    for (const p of mapped) perms.add(p)
  }
  return perms
}
