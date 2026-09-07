import { Link, Outlet, createFileRoute, notFound } from '@tanstack/react-router'
import { HttpError } from '@/lib/http/client'
import { deviceQueryOptions } from '@/features/devices/queries'

export const Route = createFileRoute('/_auth/devices/$id')({
  // Loaders throw, so a failure becomes an error page rather than a broken
  // component. A 404 becomes the in-shell not-found state.
  loader: async ({ context, params }) => {
    try {
      return await context.queryClient.ensureQueryData(deviceQueryOptions(params.id))
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) throw notFound()
      throw err
    }
  },
  component: DeviceDetailLayout,
})

function DeviceDetailLayout() {
  const device = Route.useLoaderData()
  const { id } = Route.useParams()

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">{device.name}</h1>
      <nav aria-label="Device sections" className="mt-4 flex gap-4 border-b border-slate-200">
        <Link
          to="/devices/$id"
          params={{ id }}
          activeOptions={{ exact: true }}
          activeProps={{ className: 'border-b-2 border-slate-900 pb-2 text-sm font-medium' }}
          className="pb-2 text-sm text-slate-600"
        >
          Overview
        </Link>
        <Link
          to="/devices/$id/settings"
          params={{ id }}
          activeProps={{ className: 'border-b-2 border-slate-900 pb-2 text-sm font-medium' }}
          className="pb-2 text-sm text-slate-600"
        >
          Settings
        </Link>
      </nav>
      <div className="mt-4">
        <Outlet />
      </div>
    </div>
  )
}
