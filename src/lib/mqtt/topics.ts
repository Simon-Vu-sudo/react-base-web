import { z } from 'zod'

export const TOPICS = {
  deviceTelemetry: (id: string) => `devices/${id}/telemetry`,
  deviceStatus: (id: string) => `devices/${id}/status`,
  allDeviceStatus: () => 'devices/+/status',
  allDeviceTelemetry: () => 'devices/+/telemetry',
  deviceEvents: () => 'devices/events',
} as const

export const telemetrySchema = z.object({
  deviceId: z.string(),
  ts: z.number(),
  temp: z.number(),
  humidity: z.number().optional(),
})

export const statusSchema = z.object({
  deviceId: z.string(),
  online: z.boolean(),
  ts: z.number(),
})

export const deviceEventSchema = z.object({
  type: z.enum(['registered', 'deleted']),
  deviceId: z.string(),
})

export type Telemetry = z.infer<typeof telemetrySchema>
export type DeviceStatus = z.infer<typeof statusSchema>
export type DeviceEvent = z.infer<typeof deviceEventSchema>

let dropped = 0
export const droppedCount = () => dropped
export const resetDroppedCount = () => {
  dropped = 0
}

/**
 * Devices send bytes, and firmware sends malformed bytes eventually. This
 * never throws: a throw from an MQTT message handler is outside React's error
 * boundaries and can take down the connection loop, so a single bad reading
 * from one device would kill live telemetry for every device.
 */
export function parsePayload<T>(schema: z.ZodType<T>, raw: Uint8Array | string): T | null {
  let text: string
  try {
    text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw)
  } catch {
    dropped += 1
    return null
  }

  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    dropped += 1
    if (import.meta.env.DEV) console.warn('[mqtt] dropped a non-JSON payload')
    return null
  }

  const result = schema.safeParse(json)
  if (!result.success) {
    dropped += 1
    if (import.meta.env.DEV) console.warn('[mqtt] dropped a payload failing schema validation')
    return null
  }
  return result.data
}

/** Client-side wildcard matching, for dispatching to pattern-registered handlers. */
export function matchTopic(pattern: string, topic: string): boolean {
  const p = pattern.split('/')
  const t = topic.split('/')

  for (let i = 0; i < p.length; i += 1) {
    if (p[i] === '#') return true
    if (i >= t.length) return false
    if (p[i] !== '+' && p[i] !== t[i]) return false
  }
  return p.length === t.length
}
