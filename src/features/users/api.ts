import { apiFetch } from '@/lib/http/client'

export type AppUser = {
  id: string
  email: string
  name: string
  roles: string[]
}

export const listUsers = () => apiFetch<AppUser[]>('/users')
