import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { fakeConnectFactory, lastFakeClient, resetFakeClients } from '@/test/fakeMqtt'
import { authStore } from '@/lib/auth/store'
import { PERMISSIONS } from '@/lib/rbac/permissions'
import { connectMqtt, disconnectMqtt, setConnectFactory } from './client'
import { TOPICS } from './topics'
import { useMqttSubscription } from './useMqttSubscription'

const admin = { id: 'u1', email: 'a@b.co', name: 'Ann', roles: ['admin'] }
const viewer = { id: 'u2', email: 'v@b.co', name: 'Vic', roles: ['viewer'] }

beforeEach(() => {
  resetFakeClients()
  setConnectFactory(fakeConnectFactory)
})

function Probe({ permission }: { permission?: typeof PERMISSIONS.DEVICE_DELETE }) {
  useMqttSubscription(TOPICS.deviceTelemetry('d1'), handlerSpy, { permission })
  return null
}

const handlerSpy = vi.fn()

afterEach(async () => {
  await disconnectMqtt()
})

describe('useMqttSubscription', () => {
  beforeEach(() => handlerSpy.mockClear())

  it('delivers matching messages to the handler', async () => {
    authStore.getState().setSession(admin)
    await connectMqtt()
    render(<Probe />)

    await waitFor(() => expect(lastFakeClient()!.subscriptions.size).toBeGreaterThan(0))
    lastFakeClient()!.emitMessage('devices/d1/telemetry', { deviceId: 'd1', ts: 1, temp: 20 })

    await waitFor(() => expect(handlerSpy).toHaveBeenCalledTimes(1))
  })

  it('does not subscribe without the required permission', async () => {
    authStore.getState().setSession(viewer)
    await connectMqtt()
    render(<Probe permission={PERMISSIONS.DEVICE_DELETE} />)

    await new Promise((r) => setTimeout(r, 10))
    expect(lastFakeClient()!.subscriptions.size).toBe(0)
  })

  it('unsubscribes on unmount', async () => {
    authStore.getState().setSession(admin)
    await connectMqtt()
    const { unmount } = render(<Probe />)
    await waitFor(() => expect(lastFakeClient()!.subscriptions.size).toBe(1))

    unmount()
    await waitFor(() => expect(lastFakeClient()!.subscriptions.size).toBe(0))
  })
})
