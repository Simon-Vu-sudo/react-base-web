import { createFileRoute } from '@tanstack/react-router'
import { useDevices } from '@/modules/devices/queries'
import { useDeviceEvents } from '@/modules/devices/useDeviceEvents'
import { DeviceTable } from '@/modules/devices/components/DeviceTable'
import { Spinner } from '@/modules/global/components/Spinner'
import { Alert } from '@/modules/global/components/Alert'

function DevicesPage() {
  const { data, isPending, isError } = useDevices()
  useDeviceEvents()

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Devices</h1>
      <div className="mt-4">
        {/* Component-level query errors render inline, so one failing panel
            does not replace the whole page with an error screen. */}
        {isPending && <Spinner />}
        {isError && <Alert tone="error">Could not load devices.</Alert>}
        {data && <DeviceTable devices={data} />}
      </div>
    </div>
  )
}

export const Route = createFileRoute('/_auth/devices/')({
  component: DevicesPage,
})
