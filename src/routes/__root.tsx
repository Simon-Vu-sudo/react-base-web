import { Outlet, createRootRouteWithContext, useRouter } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import type { RouterAuthSnapshot } from '@/lib/rbac/guards'
import { Button } from '@/components/ui/Button'

export type RouterContext = {
  getAuth: () => RouterAuthSnapshot
  queryClient: QueryClient
}

/** Tier 2: a bare page for anything escaping above the authenticated shell. */
function RootError({ error }: { error: unknown }) {
  const router = useRouter()
  const message = error instanceof Error ? error.message : String(error)
  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate-600">{message}</p>
      <div className="mt-4">
        <Button onClick={() => router.invalidate()}>Try again</Button>
      </div>
    </main>
  )
}

/** Bad URL — no route matched at all. */
function RootNotFound() {
  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-slate-600">That address does not exist.</p>
      <a className="mt-4 inline-block text-sm underline" href="/">
        Go home
      </a>
    </main>
  )
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
  errorComponent: RootError,
  notFoundComponent: RootNotFound,
})
