import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { installFetchMock, mockRoute, resetFetchMock } from '@/test/http'
import { authStore } from '@/lib/auth/store'
import { renderRoute, signIn } from '@/test/router'

const devices = [
  { id: 'd1', name: 'Boiler', location: 'Plant A', firmware: '1.2.0' },
  { id: 'd2', name: 'Chiller', location: 'Plant B', firmware: '1.1.0' },
]

beforeEach(() => {
  installFetchMock()
  authStore.getState().setUnauthenticated()
  mockRoute('GET', '/api/devices', { body: devices })
  mockRoute('GET', '/api/devices/d1', { body: devices[0] })
  mockRoute('GET', '/api/devices/d999', { status: 404, body: { message: 'no such device' } })
})
afterEach(() => resetFetchMock())

describe('/devices', () => {
  it('lists devices for a viewer', async () => {
    signIn(['viewer'])
    renderRoute('/devices')
    expect(await screen.findByRole('link', { name: 'Boiler' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Chiller' })).toBeInTheDocument()
  })

  it('redirects a role without device.view to /forbidden', async () => {
    signIn(['unknown-role'])
    const { router } = renderRoute('/devices')
    await waitFor(() => expect(router.state.location.pathname).toBe('/forbidden'))
  })

  it('hides the delete button from an operator', async () => {
    signIn(['operator'])
    renderRoute('/devices')
    await screen.findByRole('link', { name: 'Boiler' })
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('shows the delete button to an admin', async () => {
    signIn(['admin'])
    renderRoute('/devices')
    await screen.findByRole('link', { name: 'Boiler' })
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(2)
  })
})

describe('/devices/:id', () => {
  it('renders the device detail with tabs', async () => {
    signIn(['operator'])
    renderRoute('/devices/d1')
    expect(await screen.findByRole('heading', { name: 'Boiler' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument()
  })

  it('renders the in-shell not-found state for a missing device', async () => {
    signIn(['operator'])
    renderRoute('/devices/d999')
    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeInTheDocument()
  })
})

describe('/devices/:id/settings', () => {
  it('lets an operator open settings', async () => {
    signIn(['operator'])
    const { router } = renderRoute('/devices/d1/settings')
    expect(await screen.findByLabelText('Name')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/devices/d1/settings')
  })

  it('redirects a viewer to /forbidden', async () => {
    signIn(['viewer'])
    const { router } = renderRoute('/devices/d1/settings')
    await waitFor(() => expect(router.state.location.pathname).toBe('/forbidden'))
  })

  it('does not fetch the device when the permission guard rejects', async () => {
    signIn(['viewer'])
    const { router } = renderRoute('/devices/d1/settings')
    await waitFor(() => expect(router.state.location.pathname).toBe('/forbidden'))
    // beforeLoad runs before loader, so no request should have been made.
    const { callCount } = await import('@/test/http')
    expect(callCount('GET', '/api/devices/d1')).toBe(0)
  })
})
