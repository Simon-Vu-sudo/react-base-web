import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useMqttSubscription } from '@/lib/mqtt/useMqttSubscription'
import { TOPICS, deviceEventSchema, parsePayload } from '@/lib/mqtt/topics'
import { deviceKeys } from './queries'

/**
 * Events may invalidate Query; telemetry goes to Zustand. A device being
 * registered or deleted changes the REST list, so it invalidates.
 */
export function useDeviceEvents(): void {
  const qc = useQueryClient()

  const handler = useCallback(
    (_topic: string, payload: Uint8Array) => {
      const event = parsePayload(deviceEventSchema, payload)
      if (!event) return
      void qc.invalidateQueries({ queryKey: deviceKeys.all })
      if (event.type === 'deleted') {
        qc.removeQueries({ queryKey: deviceKeys.detail(event.deviceId) })
      }
    },
    [qc],
  )

  useMqttSubscription(TOPICS.deviceEvents(), handler)
}
