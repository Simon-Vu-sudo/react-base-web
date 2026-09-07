import { describe, expect, it } from 'vitest'
import { parseEnv } from './env'

describe('parseEnv', () => {
  it('parses a valid environment', () => {
    const result = parseEnv({
      VITE_API_URL: '/api',
      VITE_MQTT_URL: 'ws://localhost:9001/mqtt',
      VITE_MQTT_TRANSPORT: 'real',
    })
    expect(result).toEqual({
      API_URL: '/api',
      MQTT_URL: 'ws://localhost:9001/mqtt',
      MQTT_TRANSPORT: 'real',
    })
  })

  it('coerces an explicit transport override', () => {
    const result = parseEnv({
      VITE_API_URL: '/api',
      VITE_MQTT_URL: 'ws://x/mqtt',
      VITE_MQTT_TRANSPORT: 'fake',
    })
    expect(result.MQTT_TRANSPORT).toBe('fake')
  })

  it('defaults optional values when absent', () => {
    const result = parseEnv({ VITE_MQTT_URL: 'ws://x/mqtt' })
    expect(result.API_URL).toBe('/api')
    expect(result.MQTT_TRANSPORT).toBe('real')
  })

  it('throws naming the missing variable', () => {
    expect(() => parseEnv({})).toThrow(/VITE_MQTT_URL/)
  })

  it('rejects an unknown transport', () => {
    expect(() =>
      parseEnv({ VITE_MQTT_URL: 'ws://x/mqtt', VITE_MQTT_TRANSPORT: 'carrier-pigeon' }),
    ).toThrow(/VITE_MQTT_TRANSPORT/)
  })
})
