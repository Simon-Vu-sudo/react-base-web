import { beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/render'
import { authStore } from '@/lib/auth/store'
import { PERMISSIONS } from './permissions'
import { usePermissions } from './usePermissions.ts'

function Probe() {
  const { can, canAll, canAny } = usePermissions()
  return (
    <ul>
      <li>can:{String(can(PERMISSIONS.DEVICE_VIEW))}</li>
      <li>all:{String(canAll([PERMISSIONS.DEVICE_VIEW, PERMISSIONS.DEVICE_WRITE]))}</li>
      <li>any:{String(canAny([PERMISSIONS.USER_MANAGE, PERMISSIONS.DEVICE_VIEW]))}</li>
    </ul>
  )
}

beforeEach(() => authStore.getState().setUnauthenticated())

describe('usePermissions', () => {
  it('reflects the current session', () => {
    authStore
      .getState()
      .setSession({ id: 'u1', email: 'a@b.co', name: 'Ann', roles: ['viewer'] })
    renderWithProviders(<Probe />)
    expect(screen.getByText('can:true')).toBeInTheDocument()
    expect(screen.getByText('all:false')).toBeInTheDocument()
    expect(screen.getByText('any:true')).toBeInTheDocument()
  })

  it('denies everything with no session', () => {
    renderWithProviders(<Probe />)
    expect(screen.getByText('can:false')).toBeInTheDocument()
    expect(screen.getByText('any:false')).toBeInTheDocument()
  })
})
