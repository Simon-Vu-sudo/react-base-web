import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { safeRedirect } from '@/lib/auth/safeRedirect'
import { LoginForm } from '@/features/auth/LoginForm'

function LoginPage() {
  const { redirect } = Route.useSearch()
  const navigate = useNavigate()
  return <LoginForm onSuccess={() => void navigate({ to: redirect, replace: true })} />
}

export const Route = createFileRoute('/_public/login')({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: safeRedirect(search.redirect),
  }),
  component: LoginPage,
})
