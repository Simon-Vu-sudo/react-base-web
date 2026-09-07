import { Link, Outlet } from '@tanstack/react-router'
import { useAuthStore } from '@/lib/auth/store'
import { logout } from '@/lib/auth/service'
import { usePermissions } from '@/lib/rbac/usePermissions'
import { visibleNavItems } from '@/config/nav'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useConnectionStatus } from '@/lib/mqtt/connectionStore'

export function AppShell() {
  const { can } = usePermissions()
  const user = useAuthStore((s) => s.user)
  const items = visibleNavItems(can)
  const connection = useConnectionStatus()

  return (
    <div className="grid min-h-screen grid-cols-[220px_1fr]">
      <nav aria-label="Main" className="border-r border-slate-200 bg-slate-50 p-4">
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                className="block rounded px-3 py-2 text-sm text-slate-700 hover:bg-slate-200"
                activeProps={{ className: 'block rounded px-3 py-2 text-sm bg-slate-900 text-white' }}
                activeOptions={{ exact: item.to === '/' }}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-3">
          <div className="flex items-center gap-3">
            <Badge tone={connection === 'online' ? 'ok' : connection === 'connecting' ? 'warn' : 'error'}>
              {connection}
            </Badge>
            <span className="text-sm font-medium text-slate-700">{user?.name}</span>
          </div>
          <Button variant="secondary" onClick={() => void logout()}>
            Sign out
          </Button>
        </header>
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
