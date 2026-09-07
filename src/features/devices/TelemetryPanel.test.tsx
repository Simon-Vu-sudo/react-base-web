import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { fakeConnectFactory, lastFakeClient, resetFakeClients } from '@/test/fakeMqtt'
import { authStore } from '@/lib/auth/store'
import { connectMqtt, disconnectMqtt, setConnectFactory } from '@/lib/mqtt/client'
import { resetTelemetry } from '@/lib/mqtt/telemetryStore'
import { renderRoute, signIn } from '@/test/router'

beforeEach(() => {
  resetFakeClients()
  resetTelemetry()
  setConnectFactory(fakeConnectFactory)
  authStore.getState().setUnauthenticated()
})

afterEach(async () => {
  await disconnectMqtt()
})

describe('<TelemetryPanel>', () => {
  it('shows a waiting state before any reading arrives', async () => {
    signIn(['viewer'])
    renderRoute('/')
    expect(await screen.findByText(/waiting for readings/i)).toBeInTheDocument()
  })

  it('renders a reading delivered over MQTT', async () => {
    signIn(['viewer'])
    await connectMqtt()
    renderRoute('/')
    await screen.findByText(/waiting for readings/i)

    await waitFor(() => expect(lastFakeClient()!.subscriptions.size).toBeGreaterThan(0))
    lastFakeClient()!.emitMessage('devices/d1/telemetry', {
      deviceId: 'd1',
      ts: Date.now(),
      temp: 42,
    })

    expect(await screen.findByText('42°C')).toBeInTheDocument()
  })

  it('shows only the most recent value after a burst', async () => {
    signIn(['viewer'])
    await connectMqtt()
    renderRoute('/')
    await waitFor(() => expect(lastFakeClient()!.subscriptions.size).toBeGreaterThan(0))

    for (let i = 1; i <= 20; i += 1) {
      lastFakeClient()!.emitMessage('devices/d1/telemetry', {
        deviceId: 'd1',
        ts: i,
        temp: i,
      })
    }

    expect(await screen.findByText('20°C')).toBeInTheDocument()
    expect(screen.queryByText('19°C')).not.toBeInTheDocument()
  })
})
