import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { RingBuffer } from './batcher'
import type { Telemetry } from './topics'

/** Points retained per device for charting. */
export const SERIES_CAPACITY = 300

type State = {
  latest: Record<string, Telemetry>
  series: Record<string, RingBuffer<Telemetry>>
  online: Record<string, boolean>
}

export const telemetryStore = createStore<State>()(() => ({
  latest: {},
  series: {},
  online: {},
}))

/**
 * Telemetry lives here rather than in the Query cache: it is high-frequency
 * push, not request/response.
 */
export function pushTelemetry(reading: Telemetry): void {
  const { latest, series } = telemetryStore.getState()
  const buffer = series[reading.deviceId] ?? new RingBuffer<Telemetry>(SERIES_CAPACITY)
  buffer.push(reading)

  telemetryStore.setState({
    // New object identity so Zustand selectors see the change.
    latest: { ...latest, [reading.deviceId]: reading },
    series: { ...series, [reading.deviceId]: buffer },
  })
}

export function pushTelemetryBatch(batch: Map<string, Telemetry>): void {
  for (const reading of batch.values()) pushTelemetry(reading)
}

export function setOnline(deviceId: string, online: boolean): void {
  telemetryStore.setState({ online: { ...telemetryStore.getState().online, [deviceId]: online } })
}

export function resetTelemetry(): void {
  telemetryStore.setState({ latest: {}, series: {}, online: {} })
}

export function useTelemetryStore<T>(selector: (s: State) => T): T {
  return useStore(telemetryStore, selector)
}
