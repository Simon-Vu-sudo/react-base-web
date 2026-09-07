import { createFileRoute } from '@tanstack/react-router'
import { useTelemetryStore } from '@/lib/mqtt/telemetryStore'
import { Route as DetailRoute } from './_auth.devices.$id'

function DeviceOverview() {
  const { id } = DetailRoute.useParams()
  const device = DetailRoute.useLoaderData()
  const latest = useTelemetryStore((s) => s.latest[id])

  return (
    <dl className="grid grid-cols-2 gap-2 text-sm">
      <dt className="text-slate-500">Location</dt>
      <dd>{device.location}</dd>
      <dt className="text-slate-500">Firmware</dt>
      <dd>{device.firmware}</dd>
      <dt className="text-slate-500">Latest temperature</dt>
      <dd>{latest ? `${latest.temp}°C` : '—'}</dd>
    </dl>
  )
}

export const Route = createFileRoute('/_auth/devices/$id/')({
  component: DeviceOverview,
})
