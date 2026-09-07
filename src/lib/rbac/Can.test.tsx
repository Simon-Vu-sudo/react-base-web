import { beforeEach, describe, expect, it } from 'vitest'
import { act, screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/render'
import { authStore } from '@/lib/auth/store'
import { PERMISSIONS } from './permissions'
import { Can } from './Can.tsx'

const asRole = (roles: string[]) =>
  authStore.getState().setSession({ id: 'u1', email: 'a@b.co', name: 'Ann', roles })

beforeEach(() => authStore.getState().setUnauthenticated())

describe('<Can>', () => {
  it('renders children when the permission is held', () => {
    asRole(['operator'])
    renderWithProviders(
      <Can permission={PERMISSIONS.DEVICE_WRITE}>
        <button>Edit</button>
      </Can>,
    )
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })

  it('renders nothing when the permission is missing', () => {
    asRole(['viewer'])
    renderWithProviders(
      <Can permission={PERMISSIONS.DEVICE_WRITE}>
        <button>Edit</button>
      </Can>,
    )
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })

  it('renders the fallback when denied', () => {
    asRole(['viewer'])
    renderWithProviders(
      <Can permission={PERMISSIONS.DEVICE_DELETE} fallback={<span>no access</span>}>
        <button>Delete</button>
      </Can>,
    )
    expect(screen.getByText('no access')).toBeInTheDocument()
  })

  it('supports anyOf', () => {
    asRole(['viewer'])
    renderWithProviders(
      <Can anyOf={[PERMISSIONS.USER_MANAGE, PERMISSIONS.DEVICE_VIEW]}>
        <span>visible</span>
      </Can>,
    )
    expect(screen.getByText('visible')).toBeInTheDocument()
  })

  it('supports allOf', () => {
    asRole(['operator'])
    renderWithProviders(
      <Can allOf={[PERMISSIONS.DEVICE_VIEW, PERMISSIONS.USER_MANAGE]}>
        <span>visible</span>
      </Can>,
    )
    expect(screen.queryByText('visible')).not.toBeInTheDocument()
  })

  it('re-renders when roles change mid-session', () => {
    act(() => asRole(['viewer']))
    renderWithProviders(
      <Can permission={PERMISSIONS.DEVICE_WRITE}>
        <button>Edit</button>
      </Can>,
    )
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    act(() => asRole(['operator']))
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })
})
