import { beforeEach, describe, expect, it } from 'vitest'
import { SERIES_CAPACITY, pushTelemetry, resetTelemetry, setOnline, telemetryStore } from './telemetryStore'

const reading = (deviceId: string, ts: number, temp: number) => ({ deviceId, ts, temp })

beforeEach(() => resetTelemetry())

describe('telemetryStore', () => {
  it('records the latest reading per device', () => {
    pushTelemetry(reading('d1', 1, 20))
    pushTelemetry(reading('d1', 2, 21))
    pushTelemetry(reading('d2', 1, 30))

    const s = telemetryStore.getState()
    expect(s.latest.d1).toMatchObject({ ts: 2, temp: 21 })
    expect(s.latest.d2).toMatchObject({ temp: 30 })
  })

  it('appends to a per-device series', () => {
    pushTelemetry(reading('d1', 1, 20))
    pushTelemetry(reading('d1', 2, 21))
    expect(telemetryStore.getState().series.d1.toArray()).toHaveLength(2)
  })

  it('bounds the series at the configured capacity', () => {
    for (let i = 0; i < SERIES_CAPACITY + 50; i += 1) pushTelemetry(reading('d1', i, i))
    expect(telemetryStore.getState().series.d1.size).toBe(SERIES_CAPACITY)
  })

  it('tracks online status separately from readings', () => {
    setOnline('d1', true)
    setOnline('d2', false)
    expect(telemetryStore.getState().online).toEqual({ d1: true, d2: false })
  })

  it('resetTelemetry clears everything', () => {
    pushTelemetry(reading('d1', 1, 20))
    setOnline('d1', true)
    resetTelemetry()
    const s = telemetryStore.getState()
    expect(s.latest).toEqual({})
    expect(s.online).toEqual({})
  })

  it('changes the latest object identity so selectors re-render', () => {
    pushTelemetry(reading('d1', 1, 20))
    const before = telemetryStore.getState().latest
    pushTelemetry(reading('d1', 2, 21))
    expect(telemetryStore.getState().latest).not.toBe(before)
  })
})
