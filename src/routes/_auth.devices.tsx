import { Outlet, createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/lib/rbac/guards'
import { PERMISSIONS } from '@/lib/rbac/permissions'

export const Route = createFileRoute('/_auth/devices')({
  beforeLoad: requirePermission(PERMISSIONS.DEVICE_VIEW),
  component: () => <Outlet />,
})
