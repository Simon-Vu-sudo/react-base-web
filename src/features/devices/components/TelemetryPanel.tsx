import { useCallback, useEffect, useMemo } from 'react'
import { createBatcher } from '@/lib/mqtt/batcher'
import { pushTelemetryBatch, setOnline, useTelemetryStore } from '@/lib/mqtt/telemetryStore'
import { useMqttSubscription } from '@/lib/mqtt/useMqttSubscription'
import { TOPICS, parsePayload, statusSchema, telemetrySchema, type Telemetry } from '@/lib/mqtt/topics'
import { Table, Td, Th } from '@/components/ui/Table'

/**
 * The batcher is created once per mount and disposed on unmount, so a burst
 * of readings commits once per frame rather than once per message.
 */
export function TelemetryPanel() {
  const batcher = useMemo(() => createBatcher<Telemetry>(pushTelemetryBatch), [])
  useEffect(() => () => batcher.dispose(), [batcher])

  const onTelemetry = useCallback(
    (_topic: string, payload: Uint8Array) => {
      const reading = parsePayload(telemetrySchema, payload)
      if (reading) batcher.push(reading.deviceId, reading)
    },
    [batcher],
  )

  const onStatus = useCallback((_topic: string, payload: Uint8Array) => {
    const status = parsePayload(statusSchema, payload)
    if (status) setOnline(status.deviceId, status.online)
  }, [])

  useMqttSubscription(TOPICS.allDeviceTelemetry(), onTelemetry)
  useMqttSubscription(TOPICS.allDeviceStatus(), onStatus)

  const latest = useTelemetryStore((s) => s.latest)
  const rows = Object.entries(latest)

  return (
    <section>
      <h2 className="text-lg font-medium">Live telemetry</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">Waiting for readings…</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Device</Th>
              <Th>Temperature</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([id, reading]) => (
              <tr key={id}>
                <Td>{id}</Td>
                <Td>{reading.temp}°C</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </section>
  )
}
