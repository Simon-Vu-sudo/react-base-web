import { Link, Outlet, createFileRoute, notFound } from '@tanstack/react-router'
import { HttpError } from '@/lib/http/client'
import { deviceQueryOptions } from '@/modules/devices/queries'

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
  // This must live HERE, on the route whose loader throws notFound(), and not
  // on an ancestor. TanStack attributes a not-found to the nearest ancestor
  // declaring a notFoundComponent, and that match's MatchInner renders the
  // not-found component *instead of* its own `component`. Declared on `_auth`
  // it therefore replaced AppShell and the sidebar vanished — the opposite of
  // the intent. Declared here, `_auth` still renders AppShell and this fills
  // its outlet, so the user keeps the nav and is not stranded on a dead end.
  notFoundComponent: DeviceNotFound,
})

function DeviceNotFound() {
  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold">Not found</h2>
      <p className="mt-2 text-sm text-slate-600">
        That device does not exist, or it has been removed.
      </p>
    </div>
  )
}

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
