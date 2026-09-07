import { createFileRoute } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { requirePermission } from '@/lib/rbac/guards'
import { PERMISSIONS } from '@/lib/rbac/permissions'
import { useUpdateDevice } from '@/modules/devices/queries'
import { Input } from '@/modules/global/components/Input'
import { Button } from '@/modules/global/components/Button'
import { Alert } from '@/modules/global/components/Alert'
import { Route as DetailRoute } from './_auth.devices.$id'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  location: z.string().min(1, 'Location is required'),
})

function DeviceSettings() {
  const { id } = DetailRoute.useParams()
  const device = DetailRoute.useLoaderData()
  const update = useUpdateDevice(id)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: device.name, location: device.location },
  })

  return (
    <form
      onSubmit={handleSubmit(async (values) => {
        await update.mutateAsync(values)
      })}
      noValidate
      className="flex max-w-sm flex-col gap-4"
    >
      <h2 className="text-lg font-medium">Settings</h2>
      {update.isError && <Alert tone="error">Could not save changes.</Alert>}
      {update.isSuccess && <Alert tone="info">Saved.</Alert>}
      <Input label="Name" error={errors.name?.message} {...register('name')} />
      <Input label="Location" error={errors.location?.message} {...register('location')} />
      <Button type="submit" loading={isSubmitting || update.isPending}>
        Save
      </Button>
    </form>
  )
}

export const Route = createFileRoute('/_auth/devices/$id/settings')({
  beforeLoad: requirePermission(PERMISSIONS.DEVICE_WRITE),
  component: DeviceSettings,
})
