import { createFileRoute } from '@tanstack/react-router'
import { TelemetryPanel } from '@/features/devices/components/TelemetryPanel'

export const Route = createFileRoute('/_auth/')({
  component: () => (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <TelemetryPanel />
    </div>
  ),
})
