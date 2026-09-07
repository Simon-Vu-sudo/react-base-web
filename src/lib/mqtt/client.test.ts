import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeConnectFactory, lastFakeClient, resetFakeClients } from '@/test/fakeMqtt'
import { authStore } from '@/lib/auth/store'
import { connectionStore } from './connectionStore'
import {
  connectMqtt,
  disconnectMqtt,
  getClient,
  makeClientId,
  publishTopic,
  setConnectFactory,
  startMqttLifecycle,
  subscribeTopic,
} from './client'
import { TOPICS } from './topics'

const user = { id: 'u1', email: 'a@b.co', name: 'Ann', roles: ['admin'] }

beforeEach(() => {
  resetFakeClients()
  setConnectFactory(fakeConnectFactory)
  authStore.getState().setUnauthenticated()
})

afterEach(async () => {
  await disconnectMqtt()
})

describe('makeClientId', () => {
  it('is unique per call so two tabs cannot evict each other', () => {
    const a = makeClientId('u1')
    const b = makeClientId('u1')
    expect(a).not.toBe(b)
    expect(a.startsWith('u1-')).toBe(true)
  })
})

describe('connectMqtt', () => {
  it('passes NO credentials to the broker', async () => {
    authStore.getState().setSession(user)
    await connectMqtt()
    const opts = lastFakeClient()!.options

    // The requirement: the frontend never holds a token. The session cookie
    // rides the WebSocket upgrade and the backend authenticates it.
    expect(opts.username).toBeUndefined()
    expect(opts.password).toBeUndefined()
    expect(opts.transformWsUrl).toBeUndefined()
  })

  it('connects with a clean session and a unique client id', async () => {
    authStore.getState().setSession(user)
    await connectMqtt()
    const client = lastFakeClient()
    expect(client).toBeDefined()
    expect(client!.options.clean).toBe(true)
    expect(String(client!.options.clientId)).toMatch(/^u1-/)
  })

  it('connects to the configured broker URL', async () => {
    authStore.getState().setSession(user)
    await connectMqtt()
    expect(lastFakeClient()!.url).toBeTruthy()
  })

  it('does nothing when unauthenticated', async () => {
    await connectMqtt()
    expect(getClient()).toBeNull()
  })

  it('reports online once the broker acknowledges', async () => {
    authStore.getState().setSession(user)
    await connectMqtt()
    await vi.waitFor(() => expect(connectionStore.getState().status).toBe('online'))
  })

  it('does not create a second connection when already connected', async () => {
    authStore.getState().setSession(user)
    await connectMqtt()
    const first = getClient()
    await connectMqtt()
    expect(getClient()).toBe(first)
  })
})

describe('disconnectMqtt', () => {
  it('ends the client and drops it', async () => {
    authStore.getState().setSession(user)
    await connectMqtt()
    const client = lastFakeClient()!
    await disconnectMqtt()
    expect(client.ended).toBe(true)
    expect(getClient()).toBeNull()
    expect(connectionStore.getState().status).toBe('offline')
  })
})

describe('message dispatch', () => {
  it('routes a message to a handler registered with a wildcard', async () => {
    authStore.getState().setSession(user)
    await connectMqtt()
    const handler = vi.fn()
    await subscribeTopic(TOPICS.allDeviceStatus(), handler)

    lastFakeClient()!.emitMessage('devices/d1/status', { deviceId: 'd1', online: true, ts: 1 })

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0]).toBe('devices/d1/status')
  })

  it('does not route a message to a non-matching handler', async () => {
    authStore.getState().setSession(user)
    await connectMqtt()
    const handler = vi.fn()
    await subscribeTopic(TOPICS.deviceTelemetry('d1'), handler)

    lastFakeClient()!.emitMessage('devices/d2/telemetry', { deviceId: 'd2', ts: 1, temp: 1 })

    expect(handler).not.toHaveBeenCalled()
  })

  it('unsubscribing stops delivery', async () => {
    authStore.getState().setSession(user)
    await connectMqtt()
    const handler = vi.fn()
    const off = await subscribeTopic(TOPICS.deviceTelemetry('d1'), handler)
    off()

    lastFakeClient()!.emitMessage('devices/d1/telemetry', { deviceId: 'd1', ts: 1, temp: 1 })

    expect(handler).not.toHaveBeenCalled()
  })

  it('a throwing handler does not break dispatch for others', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    authStore.getState().setSession(user)
    await connectMqtt()
    const good = vi.fn()
    await subscribeTopic(TOPICS.deviceTelemetry('d1'), () => {
      throw new Error('handler blew up')
    })
    await subscribeTopic(TOPICS.deviceTelemetry('d1'), good)

    expect(() =>
      lastFakeClient()!.emitMessage('devices/d1/telemetry', { deviceId: 'd1', ts: 1, temp: 1 }),
    ).not.toThrow()
    expect(good).toHaveBeenCalledTimes(1)
    vi.restoreAllMocks()
  })
})

describe('publishTopic', () => {
  it('publishes commands at QoS 1', async () => {
    authStore.getState().setSession(user)
    await connectMqtt()
    await publishTopic('devices/d1/cmd', { action: 'reboot' })
    expect(lastFakeClient()!.published[0]).toMatchObject({ topic: 'devices/d1/cmd', qos: 1 })
  })

  it('throws when not connected', async () => {
    await expect(publishTopic('devices/d1/cmd', {})).rejects.toThrow(/not connected/i)
  })
})

describe('reconnect backoff', () => {
  it('grows reconnectPeriod on repeated reconnect attempts', async () => {
    authStore.getState().setSession(user)
    await connectMqtt()
    const client = lastFakeClient()!
    const initial = Number(client.options.reconnectPeriod)

    client.emitEvent('reconnect')
    const after1 = Number(client.options.reconnectPeriod)
    client.emitEvent('reconnect')
    const after2 = Number(client.options.reconnectPeriod)

    expect(after1).toBeGreaterThan(initial)
    expect(after2).toBeGreaterThan(after1)
  })

  it('caps the backoff rather than growing without bound', async () => {
    authStore.getState().setSession(user)
    await connectMqtt()
    const client = lastFakeClient()!
    for (let i = 0; i < 20; i += 1) client.emitEvent('reconnect')
    expect(Number(client.options.reconnectPeriod)).toBeLessThanOrEqual(30_000)
  })

  it('resets the backoff after a successful connect', async () => {
    authStore.getState().setSession(user)
    await connectMqtt()
    const client = lastFakeClient()!
    const initial = Number(client.options.reconnectPeriod)
    client.emitEvent('reconnect')
    client.emitEvent('connect')
    expect(Number(client.options.reconnectPeriod)).toBe(initial)
  })
})

describe('startMqttLifecycle', () => {
  it('connects on login and disconnects on logout', async () => {
    const stop = startMqttLifecycle()

    authStore.getState().setSession(user)
    await vi.waitFor(() => expect(getClient()).not.toBeNull())
    const client = lastFakeClient()!

    authStore.getState().setUnauthenticated()
    await vi.waitFor(() => expect(client.ended).toBe(true))
    expect(getClient()).toBeNull()

    stop()
  })
})
