import { z } from 'zod'

const schema = z.object({
  VITE_API_URL: z.string().min(1).default('/api'),
  VITE_MQTT_URL: z.string().min(1),
  VITE_MQTT_TRANSPORT: z.enum(['real', 'fake']).default('real'),
})

export type Env = {
  API_URL: string
  MQTT_URL: string
  MQTT_TRANSPORT: 'real' | 'fake'
}

export function parseEnv(raw: Record<string, unknown>): Env {
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => i.path.join('.')).join(', ')
    throw new Error(`Invalid environment configuration: ${names}`)
  }
  return {
    API_URL: parsed.data.VITE_API_URL,
    MQTT_URL: parsed.data.VITE_MQTT_URL,
    MQTT_TRANSPORT: parsed.data.VITE_MQTT_TRANSPORT,
  }
}

export const env: Env = parseEnv(import.meta.env as unknown as Record<string, unknown>)
