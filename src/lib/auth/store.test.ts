import { beforeEach, describe, expect, it } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import { PERMISSIONS } from '@/lib/rbac/permissions'
import { authStore, useAuthStore } from './store'

const user = { id: 'u1', email: 'a@b.co', name: 'Ann', roles: ['operator'] }

beforeEach(() => authStore.getState().setUnauthenticated())

describe('authStore', () => {
  it('starts unauthenticated with no user and no permissions', () => {
    const s = authStore.getState()
    expect(s.status).toBe('unauthenticated')
    expect(s.user).toBeNull()
    expect(s.permissions.size).toBe(0)
  })

  it('setSession stores the user and resolves permissions from roles', () => {
    authStore.getState().setSession(user)
    const s = authStore.getState()
    expect(s.status).toBe('authenticated')
    expect(s.user).toEqual(user)
    expect(s.permissions.has(PERMISSIONS.DEVICE_WRITE)).toBe(true)
    expect(s.permissions.has(PERMISSIONS.USER_MANAGE)).toBe(false)
  })

  it('setUnauthenticated clears the user and permissions', () => {
    authStore.getState().setSession(user)
    authStore.getState().setUnauthenticated()
    const s = authStore.getState()
    expect(s.status).toBe('unauthenticated')
    expect(s.user).toBeNull()
    expect(s.permissions.size).toBe(0)
  })

  it('setBootstrapError records the error state without a user', () => {
    authStore.getState().setBootstrapError()
    const s = authStore.getState()
    expect(s.status).toBe('bootstrapError')
    expect(s.user).toBeNull()
  })

  it('notifies subscribers when the permission set changes identity', () => {
    const seen: number[] = []
    const unsub = authStore.subscribe((s) => seen.push(s.permissions.size))
    authStore.getState().setSession(user)
    unsub()
    expect(seen).toContain(3)
  })

  it('useAuthStore selects state from the store in a component', () => {
    function TestComponent() {
      const status = useAuthStore((s) => s.status)
      return React.createElement('div', {}, status)
    }
    render(React.createElement(TestComponent))
    expect(screen.getByText('unauthenticated')).toBeInTheDocument()
  })
})
