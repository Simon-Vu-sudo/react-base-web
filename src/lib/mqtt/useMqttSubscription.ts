import { useEffect, useRef } from 'react'
import { usePermissions } from '@/lib/rbac/usePermissions'
import type { Permission } from '@/lib/rbac/permissions'
import { subscribeTopic } from './client'
import { useConnectionStatus } from './connectionStore'

type Handler = (topic: string, payload: Uint8Array) => void

/**
 * Component-scoped subscription. The permission check prevents accidental
 * subscribes; the broker's topic ACL is what actually enforces access.
 */
export function useMqttSubscription(
  topic: string,
  handler: Handler,
  opts: { permission?: Permission; qos?: 0 | 1 } = {},
): void {
  const { can } = usePermissions()
  const status = useConnectionStatus()
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  })

  const allowed = opts.permission === undefined || can(opts.permission)

  useEffect(() => {
    if (!allowed) return
    if (status !== 'online') return

    let off: (() => void) | undefined
    let cancelled = false

    void subscribeTopic(topic, (t, p) => handlerRef.current(t, p), opts.qos ?? 0).then((fn) => {
      if (cancelled) fn()
      else off = fn
    })

    return () => {
      cancelled = true
      off?.()
    }
  }, [topic, allowed, status, opts.qos])
}
