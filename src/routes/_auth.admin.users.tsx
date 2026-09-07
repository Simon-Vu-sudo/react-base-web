import { createFileRoute } from '@tanstack/react-router'
import { useUsers } from '@/modules/users/queries'
import { Table, Td, Th } from '@/modules/global/components/Table'
import { Badge } from '@/modules/global/components/Badge'
import { Spinner } from '@/modules/global/components/Spinner'
import { Alert } from '@/modules/global/components/Alert'

function UsersPage() {
  const { data, isPending, isError } = useUsers()

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Users</h1>
      <div className="mt-4">
        {isPending && <Spinner />}
        {isError && <Alert tone="error">Could not load users.</Alert>}
        {data && (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Roles</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.id}>
                  <Td>{u.name}</Td>
                  <Td>{u.email}</Td>
                  <Td>
                    <span className="flex gap-1">
                      {u.roles.map((r) => (
                        <Badge key={r}>{r}</Badge>
                      ))}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </div>
  )
}

export const Route = createFileRoute('/_auth/admin/users')({
  component: UsersPage,
})
