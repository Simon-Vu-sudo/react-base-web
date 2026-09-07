import { RouterProvider } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from '@/lib/auth/store'
import { bootstrap } from '@/lib/auth/service'
import { Button } from '@/components/ui/Button'
import { queryClient } from './queryClient'
import { router } from './router'

/** The third bootstrap outcome: the server could not be reached at all. */
function ServerUnreachable() {
  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-xl font-semibold">Cannot reach the server</h1>
      <p className="mt-2 text-sm text-slate-600">
        You have not been signed out — the application could not contact the server.
      </p>
      <div className="mt-4">
        <Button onClick={() => void bootstrap()}>Retry</Button>
      </div>
    </main>
  )
}

export function AppRoot() {
  const status = useAuthStore((s) => s.status)

  return (
    <QueryClientProvider client={queryClient}>
      {status === 'bootstrapError' ? <ServerUnreachable /> : <RouterProvider router={router} />}
    </QueryClientProvider>
  )
}
