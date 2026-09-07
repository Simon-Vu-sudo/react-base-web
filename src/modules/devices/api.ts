import { apiFetch } from '@/lib/http/client'

export type Device = {
  id: string
  name: string
  location: string
  firmware: string
}

export const listDevices = () => apiFetch<Device[]>('/devices')
export const getDevice = (id: string) => apiFetch<Device>(`/devices/${id}`)
export const updateDevice = (id: string, patch: Partial<Device>) =>
  apiFetch<Device>(`/devices/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
export const deleteDevice = (id: string) =>
  apiFetch<void>(`/devices/${id}`, { method: 'DELETE' })
