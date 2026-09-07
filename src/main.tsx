import { createRoot } from 'react-dom/client'
import { setHttpHooks } from '@/lib/http/client'
import { authStore } from '@/lib/auth/store'
import { bootstrap, registerLogoutHandler, resyncSession } from '@/lib/auth/service'
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
