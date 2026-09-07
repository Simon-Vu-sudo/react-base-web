import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_auth/')({
  component: () => (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>
    </div>
  ),
})
