import { env } from '@/config/env'
import { authStore } from '@/lib/auth/store'
import { connectionStore } from './connectionStore'
import { matchTopic } from './topics'

/** The narrow surface the app uses. Kept small so the fake is cheap to write. */
export type MqttLike = {
  options: Record<string, unknown>
  on(event: string, cb: (...args: unknown[]) => void): unknown
  subscribeAsync(topic: string, opts?: unknown): Promise<unknown>
  unsubscribeAsync(topic: string): Promise<unknown>
  publishAsync(topic: string, payload: string, opts?: unknown): Promise<unknown>
  endAsync(): Promise<unknown>
}

export type ConnectFactory = (url: string, opts: Record<string, unknown>) => MqttLike

const BASE_RECONNECT_MS = 1_000
const MAX_RECONNECT_MS = 30_000

let factory: ConnectFactory | null = null
let client: MqttLike | null = null
let connecting: Promise<void> | null = null

type MessageHandler = (topic: string, payload: Uint8Array) => void
const handlers = new Map<string, Set<MessageHandler>>()

export function setConnectFactory(fn: ConnectFactory): void {
  factory = fn
}

async function realFactory(): Promise<ConnectFactory> {
  const mqtt = await import('mqtt')
  return (url, opts) => mqtt.connect(url, opts) as unknown as MqttLike
}

/**
 * Unique per tab. Brokers evict an existing session when a client reconnects
 * with the same id, so a shared id makes two tabs disconnect each other in a
 * loop.
 */
export function makeClientId(userId: string): string {
  return `${userId}-${crypto.randomUUID().slice(0, 8)}`
}

export function getClient(): MqttLike | null {
  return client
}

function dispatch(topic: string, payload: Uint8Array): void {
  for (const [pattern, set] of handlers) {
    if (!matchTopic(pattern, topic)) continue
    for (const handler of set) {
      try {
        handler(topic, payload)
      } catch (err) {
        // One bad handler must not stop the others or kill the connection.
        console.error('[mqtt] handler threw', err)
      }
    }
  }
}

export async function connectMqtt(): Promise<void> {
  if (authStore.getState().status !== 'authenticated') return
  if (client) return
  if (connecting) return connecting

  connecting = (async () => {
    const user = authStore.getState().user
    if (!user) return

    const connect = factory ?? (await realFactory())

    connectionStore.getState().setStatus('connecting')

    // No username, no password, no token. The browser attaches the session
    // cookie to the WebSocket upgrade and the backend authenticates it —
    // the same trust model as every REST call.
    const next = connect(env.MQTT_URL, {
      clientId: makeClientId(user.id),
      // A browser is not a durable subscriber: a persistent session makes the
      // broker queue messages for tabs that closed days ago.
      clean: true,
      keepalive: 30,
      connectTimeout: 10_000,
      reconnectPeriod: BASE_RECONNECT_MS,
    })

    next.on('connect', () => {
      next.options.reconnectPeriod = BASE_RECONNECT_MS
      connectionStore.getState().setStatus('online')
    })
    next.on('reconnect', () => {
      // MQTT.js only supports a fixed period, so grow it by hand rather than
      // hammering a broker that is down.
      const current = Number(next.options.reconnectPeriod ?? BASE_RECONNECT_MS)
      next.options.reconnectPeriod = Math.min(current * 2, MAX_RECONNECT_MS)
      connectionStore.getState().setStatus('connecting')
    })
    next.on('close', () => connectionStore.getState().setStatus('offline'))
    next.on('offline', () => connectionStore.getState().setStatus('offline'))
    next.on('error', (err: unknown) => console.error('[mqtt] error', err))
    next.on('message', (...args: unknown[]) => dispatch(args[0] as string, args[1] as Uint8Array))

    client = next
  })().finally(() => {
    connecting = null
  })

  return connecting
}

export async function disconnectMqtt(): Promise<void> {
  const current = client
  client = null
  handlers.clear()
  connectionStore.getState().setStatus('offline')
  if (current) await current.endAsync()
}

export async function subscribeTopic(
  topic: string,
  handler: MessageHandler,
  qos: 0 | 1 = 0,
): Promise<() => void> {
  const set = handlers.get(topic) ?? new Set<MessageHandler>()
  const isFirst = set.size === 0
  set.add(handler)
  handlers.set(topic, set)

  if (isFirst && client) await client.subscribeAsync(topic, { qos })

  return () => {
    const live = handlers.get(topic)
    if (!live) return
    live.delete(handler)
    if (live.size === 0) {
      handlers.delete(topic)
      void client?.unsubscribeAsync(topic)
    }
  }
}

/** Commands go at QoS 1 — delivery matters, unlike telemetry. */
export async function publishTopic(topic: string, payload: unknown, qos: 0 | 1 = 1): Promise<void> {
  if (!client) throw new Error('MQTT is not connected')
  await client.publishAsync(topic, JSON.stringify(payload), { qos })
}

/**
 * Binds the connection to the session, not to app mount. Leaving the socket
 * open after logout means the previous user keeps receiving telemetry.
 */
export function startMqttLifecycle(): () => void {
  const apply = (status: string) => {
    if (status === 'authenticated') void connectMqtt()
    else void disconnectMqtt()
  }

  apply(authStore.getState().status)
  return authStore.subscribe((s, prev) => {
    if (s.status !== prev.status) apply(s.status)
  })
}
