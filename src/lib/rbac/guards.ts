import { redirect } from '@tanstack/react-router'
import type { AuthState } from '@/lib/auth/store'
import { canAll, canAny } from './predicates'
import type { Permission } from './permissions'

export type RouterAuthSnapshot = Pick<AuthState, 'status' | 'permissions'>

export type GuardArgs = {
  context: { getAuth: () => RouterAuthSnapshot }
  location: { href: string }
}

/**
 * Blocks a route for anyone without a session. Not a security boundary — it
 * keeps users out of pages that would only fail against the API anyway.
 */
export function requireAuth({ context, location }: GuardArgs): void {
  if (context.getAuth().status !== 'authenticated') {
    throw redirect({ to: '/login', search: { redirect: location.href } })
  }
}

export function requirePermission(...need: Permission[]) {
  return ({ context }: GuardArgs): void => {
    if (!canAll(context.getAuth().permissions, need)) {
      throw redirect({ to: '/forbidden' })
    }
  }
}

export function requireAnyPermission(...need: Permission[]) {
  return ({ context }: GuardArgs): void => {
    if (!canAny(context.getAuth().permissions, need)) {
      throw redirect({ to: '/forbidden' })
    }
  }
}
