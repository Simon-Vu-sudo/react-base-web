import { createFileRoute } from '@tanstack/react-router'
import { safeRedirect } from '@/lib/auth/safeRedirect'

export const Route = createFileRoute('/_public/login')({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: safeRedirect(search.redirect),
  }),
  component: () => (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Sign in</h1>
    </div>
  ),
})
