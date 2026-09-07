import type { MqttLike } from '@/lib/mqtt/client'

type Handler = (...args: unknown[]) => void

export class FakeMqttClient implements MqttLike {
  options: Record<string, unknown>
  subscriptions = new Set<string>()
  published: { topic: string; payload: string; qos?: number }[] = []
  ended = false

  private handlers = new Map<string, Handler[]>()

  constructor(
    readonly url: string,
    options: Record<string, unknown> = {},
  ) {
    this.options = { ...options }
  }

  on(event: string, cb: Handler): this {
    const list = this.handlers.get(event) ?? []
    list.push(cb)
    this.handlers.set(event, list)
    return this
  }

  async subscribeAsync(topic: string): Promise<void> {
    this.subscriptions.add(topic)
  }

  async unsubscribeAsync(topic: string): Promise<void> {
    this.subscriptions.delete(topic)
  }

  async publishAsync(topic: string, payload: string, opts?: { qos?: number }): Promise<void> {
    this.published.push({ topic, payload, qos: opts?.qos })
  }

  async endAsync(): Promise<void> {
    this.ended = true
    this.emitEvent('close')
  }

  /** Drive a test: pretend the broker delivered a message. */
  emitMessage(topic: string, payload: unknown): void {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
    this.emitEvent('message', topic, new TextEncoder().encode(body))
  }

  emitEvent(event: string, ...args: unknown[]): void {
    for (const cb of this.handlers.get(event) ?? []) cb(...args)
  }
}

/** Registry so a test can reach the client the code under test created. */
export const fakeClients: FakeMqttClient[] = []

export function fakeConnectFactory(url: string, opts: Record<string, unknown>): MqttLike {
  const client = new FakeMqttClient(url, opts)
  fakeClients.push(client)
  // Connect asynchronously, the way a real broker handshake behaves.
  queueMicrotask(() => client.emitEvent('connect'))
  return client
}

export function resetFakeClients(): void {
  fakeClients.length = 0
}

export const lastFakeClient = (): FakeMqttClient | undefined => fakeClients.at(-1)
