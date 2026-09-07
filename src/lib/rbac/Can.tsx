import { type ReactNode } from 'react'
import { usePermissions } from './usePermissions'
import type { Permission } from './permissions'

type Props = {
  children: ReactNode
  fallback?: ReactNode
  permission?: Permission
  anyOf?: readonly Permission[]
  allOf?: readonly Permission[]
}

/**
 * Element-level gating. This hides controls; it does not protect anything.
 * The BE endpoint is the authorization boundary.
 */
export function Can({ children, fallback = null, permission, anyOf, allOf }: Props): ReactNode {
  const { can, canAll, canAny } = usePermissions()

  const allowed =
    (permission === undefined || can(permission)) &&
    (anyOf === undefined || canAny(anyOf)) &&
    (allOf === undefined || canAll(allOf))

  return <>{allowed ? children : fallback}</>
}
