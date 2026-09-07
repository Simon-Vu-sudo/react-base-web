import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteDevice, getDevice, listDevices, updateDevice, type Device } from './api'

export const deviceKeys = {
  all: ['devices'] as const,
  detail: (id: string) => ['devices', id] as const,
}

export const devicesQueryOptions = () => ({
  queryKey: deviceKeys.all,
  queryFn: listDevices,
})

export const deviceQueryOptions = (id: string) => ({
  queryKey: deviceKeys.detail(id),
  queryFn: () => getDevice(id),
})

export const useDevices = () => useQuery(devicesQueryOptions())
export const useDevice = (id: string) => useQuery(deviceQueryOptions(id))

export function useUpdateDevice(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<Device>) => updateDevice(id, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: deviceKeys.all })
      void qc.invalidateQueries({ queryKey: deviceKeys.detail(id) })
    },
  })
}

export function useDeleteDevice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteDevice(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: deviceKeys.all }),
  })
}
