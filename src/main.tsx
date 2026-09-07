import { createRoot } from 'react-dom/client'
import { setHttpHooks } from '@/lib/http/client'
import { authStore } from '@/lib/auth/store'
import { bootstrap, registerLogoutHandler, resyncSession } from '@/lib/auth/service'
import { disconnectMqtt, setConnectFactory, startMqttLifecycle } from '@/lib/mqtt/client'
import { env } from '@/config/env'
import { queryClient } from '@/app/queryClient'
import { router } from '@/app/router'
import { AppErrorBoundary } from '@/app/AppErrorBoundary'
import { AppRoot } from '@/app/AppRoot'
import './index.css'

// A failed refresh is a hard logout: drop cached data so the next user cannot
// see it, then let the guards do the redirecting.
setHttpHooks({
  onRefreshFailed: () => {
    authStore.getState().setUnauthenticated()
    queryClient.clear()
  },
  onForbidden: () => {
    void resyncSession()
  },
})

registerLogoutHandler(() => queryClient.clear())

// E2E swaps in the in-memory transport. Dynamically imported so the fake is
// not part of the production chunk.
if (env.MQTT_TRANSPORT === 'fake') {
  const { fakeConnectFactory, lastFakeClient } = await import('@/test/fakeMqtt')
  setConnectFactory(fakeConnectFactory)
  ;(window as unknown as Record<string, unknown>).__mqttFake = {
    emit: (topic: string, payload: unknown) => lastFakeClient()?.emitMessage(topic, payload),
  }
}

registerLogoutHandler(() => void disconnectMqtt())
startMqttLifecycle()

// Guards only re-run on navigation, so tell the router when auth changes
// underneath it. Logout therefore needs no explicit navigate() anywhere.
authStore.subscribe((s, prev) => {
  if (s.status !== prev.status || s.permissions !== prev.permissions) {
    void router.invalidate()
  }
})

const el = document.getElementById('root')
if (!el) throw new Error('#root not found')

// Resolve the session BEFORE mounting the router, so no guard ever runs
// against an unknown session.
void bootstrap().finally(() => {
  createRoot(el).render(
    <AppErrorBoundary>
      <AppRoot />
    </AppErrorBoundary>,
  )
})
