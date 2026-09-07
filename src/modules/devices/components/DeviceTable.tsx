import { Link } from '@tanstack/react-router'
import { Can } from '@/lib/rbac/Can'
import { PERMISSIONS } from '@/lib/rbac/permissions'
import { Table, Td, Th } from '@/modules/global/components/Table'
import { Button } from '@/modules/global/components/Button'
import { Badge } from '@/modules/global/components/Badge'
import { useTelemetryStore } from '@/lib/mqtt/telemetryStore'
import type { Device } from '../api'
import { useDeleteDevice } from '../queries'

export function DeviceTable({ devices }: { devices: Device[] }) {
  const online = useTelemetryStore((s) => s.online)
  const del = useDeleteDevice()

  return (
    <Table>
      <thead>
        <tr>
          <Th>Name</Th>
          <Th>Location</Th>
          <Th>Status</Th>
          <Th>Actions</Th>
        </tr>
      </thead>
      <tbody>
        {devices.map((device) => (
          <tr key={device.id}>
            <Td>
              <Link to="/devices/$id" params={{ id: device.id }} className="underline">
                {device.name}
              </Link>
            </Td>
            <Td>{device.location}</Td>
            <Td>
              <Badge tone={online[device.id] ? 'ok' : 'neutral'}>
                {online[device.id] ? 'online' : 'unknown'}
              </Badge>
            </Td>
            <Td>
              {/* The demo's only element-level gate. Hides the control; the
                  API is what actually refuses the delete. */}
              <Can permission={PERMISSIONS.DEVICE_DELETE}>
                <Button
                  variant="danger"
                  loading={del.isPending}
                  onClick={() => del.mutate(device.id)}
                >
                  Delete
                </Button>
              </Can>
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  )
}
