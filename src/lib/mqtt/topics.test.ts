import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import {
  TOPICS,
  droppedCount,
  matchTopic,
  parsePayload,
  resetDroppedCount,
  telemetrySchema,
} from './topics'

beforeEach(() => resetDroppedCount())
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('TOPICS', () => {
  it('builds device topics', () => {
    expect(TOPICS.deviceTelemetry('d1')).toBe('devices/d1/telemetry')
    expect(TOPICS.deviceStatus('d1')).toBe('devices/d1/status')
    expect(TOPICS.allDeviceStatus()).toBe('devices/+/status')
    expect(TOPICS.allDeviceTelemetry()).toBe('devices/+/telemetry')
    expect(TOPICS.deviceEvents()).toBe('devices/events')
  })
})

describe('matchTopic', () => {
  it('matches an exact topic', () => {
    expect(matchTopic('devices/d1/status', 'devices/d1/status')).toBe(true)
  })
  it('matches a single-level + wildcard', () => {
    expect(matchTopic('devices/+/status', 'devices/d1/status')).toBe(true)
    expect(matchTopic('devices/+/status', 'devices/d1/telemetry')).toBe(false)
  })
  it('does not let + span levels', () => {
    expect(matchTopic('devices/+', 'devices/d1/status')).toBe(false)
  })
  it('matches a multi-level # wildcard', () => {
    expect(matchTopic('devices/#', 'devices/d1/status')).toBe(true)
    expect(matchTopic('devices/#', 'devices')).toBe(true)
    expect(matchTopic('#', 'anything/at/all')).toBe(true)
  })
  it('rejects a topic shorter than the pattern', () => {
    expect(matchTopic('devices/d1/status', 'devices/d1')).toBe(false)
  })
})

describe('parsePayload', () => {
  const valid = JSON.stringify({ deviceId: 'd1', ts: 1, temp: 21.5 })

  it('parses a valid JSON string payload', () => {
    expect(parsePayload(telemetrySchema, valid)).toEqual({ deviceId: 'd1', ts: 1, temp: 21.5 })
  })

  it('parses a Uint8Array payload', () => {
    const bytes = new TextEncoder().encode(valid)
    expect(parsePayload(telemetrySchema, bytes)).toMatchObject({ deviceId: 'd1' })
  })

  it('returns null for malformed JSON without throwing', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => parsePayload(telemetrySchema, '{not json')).not.toThrow()
    expect(parsePayload(telemetrySchema, '{not json')).toBeNull()
  })

  it('returns null when the shape is wrong', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(parsePayload(telemetrySchema, JSON.stringify({ deviceId: 'd1' }))).toBeNull()
  })

  it('counts dropped messages', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    parsePayload(telemetrySchema, 'garbage')
    parsePayload(telemetrySchema, '{}')
    expect(droppedCount()).toBe(2)
  })

  it('does not count a valid message as dropped', () => {
    parsePayload(telemetrySchema, valid)
    expect(droppedCount()).toBe(0)
  })

  it('does not warn outside development', () => {
    vi.stubEnv('DEV', false)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(parsePayload(telemetrySchema, 'garbage')).toBeNull()
    expect(warn).not.toHaveBeenCalled()
    expect(droppedCount()).toBe(1)
  })
})
