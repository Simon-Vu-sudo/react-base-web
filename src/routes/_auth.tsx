import { createFileRoute, useRouter } from '@tanstack/react-router'
import { requireAuth } from '@/lib/rbac/guards'
import { Button } from '@/modules/global/components/Button'
import { AppShell } from '@/modules/global/components/AppShell'

/** Tier 1: keeps the shell so the user can navigate away from a failure. */
function ShellError({ error }: { error: unknown }) {
  const router = useRouter()
  const message = error instanceof Error ? error.message : String(error)
  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold">This page failed to load</h2>
      <p className="mt-2 text-sm text-slate-600">{message}</p>
      <div className="mt-4">
        <Button onClick={() => router.invalidate()}>Retry</Button>
      </div>
    </div>
  )
}

/** Resource not found, inside the shell — the loader threw notFound(). */
function ShellNotFound() {
  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold">Not found</h2>
      <p className="mt-2 text-sm text-slate-600">
        That item does not exist, or it has been removed.
      </p>
    </div>
  )
}

export const Route = createFileRoute('/_auth')({
  beforeLoad: requireAuth,
  component: AppShell,
  errorComponent: ShellError,
  notFoundComponent: ShellNotFound,
})
