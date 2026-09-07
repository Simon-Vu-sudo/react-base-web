import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_auth/forbidden')({
  component: () => (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Not permitted</h1>
      <p className="mt-2 text-sm text-slate-600">
        Your account does not have access to this page.
      </p>
    </div>
  ),
})
