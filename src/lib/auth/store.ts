import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { resolvePermissions } from '@/lib/rbac/resolve'
import type { Permission } from '@/lib/rbac/permissions'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'bootstrapError'

export type User = {
  id: string
  email: string
  name: string
  roles: string[]
}

export type AuthState = {
  status: AuthStatus
  user: User | null
  permissions: ReadonlySet<Permission>
  setSession: (user: User) => void
  setUnauthenticated: () => void
  setBootstrapError: () => void
}

const EMPTY: ReadonlySet<Permission> = new Set()

/**
 * Vanilla store, not a React hook: the http client and the route guards both
 * read it via getState() from outside React.
 */
export const authStore = createStore<AuthState>()((set) => ({
  status: 'loading',
  user: null,
  permissions: EMPTY,
  setSession: (user) =>
    set({ status: 'authenticated', user, permissions: resolvePermissions(user.roles) }),
  setUnauthenticated: () => set({ status: 'unauthenticated', user: null, permissions: EMPTY }),
  setBootstrapError: () => set({ status: 'bootstrapError', user: null, permissions: EMPTY }),
}))

export function useAuthStore<T>(selector: (s: AuthState) => T): T {
  return useStore(authStore, selector)
}
