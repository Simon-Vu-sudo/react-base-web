import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_public')({
  beforeLoad: ({ context }) => {
    if (context.getAuth().status === 'authenticated') throw redirect({ to: '/' })
  },
  component: () => (
    <div className="grid min-h-screen place-items-center bg-slate-50">
      <Outlet />
    </div>
  ),
})
