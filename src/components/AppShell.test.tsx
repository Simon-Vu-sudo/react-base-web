import { beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { authStore } from '@/lib/auth/store'
import { renderRoute, signIn } from '@/test/router'

beforeEach(() => authStore.getState().setUnauthenticated())

describe('<AppShell>', () => {
  it('shows the user name', async () => {
    signIn(['admin'])
    renderRoute('/')
    expect(await screen.findByText('Ann')).toBeInTheDocument()
  })

  it('shows Devices and Users to an admin', async () => {
    signIn(['admin'])
    renderRoute('/')
    expect(await screen.findByRole('link', { name: 'Devices' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Users' })).toBeInTheDocument()
  })

  it('hides Users from an operator', async () => {
    signIn(['operator'])
    renderRoute('/')
    expect(await screen.findByRole('link', { name: 'Devices' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument()
  })

  it('hides Devices from a role with no device permission', async () => {
    signIn(['unknown-role'])
    renderRoute('/')
    expect(await screen.findByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Devices' })).not.toBeInTheDocument()
  })

  it('offers a sign-out control', async () => {
    signIn(['viewer'])
    renderRoute('/')
    expect(await screen.findByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })
})
