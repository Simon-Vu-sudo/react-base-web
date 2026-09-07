import { useMemo } from 'react'
import { useAuthStore } from '@/lib/auth/store'
import { can as canFn, canAll as canAllFn, canAny as canAnyFn } from './can'
import type { Permission } from './permissions'

export function usePermissions() {
  const permissions = useAuthStore((s) => s.permissions)
  return useMemo(
    () => ({
      can: (p: Permission) => canFn(permissions, p),
      canAll: (ps: readonly Permission[]) => canAllFn(permissions, ps),
      canAny: (ps: readonly Permission[]) => canAnyFn(permissions, ps),
    }),
    [permissions],
  )
}
