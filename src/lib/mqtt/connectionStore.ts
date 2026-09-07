import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'

export type ConnectionStatus = 'offline' | 'connecting' | 'online'

type State = {
  status: ConnectionStatus
  setStatus: (status: ConnectionStatus) => void
}

export const connectionStore = createStore<State>()((set) => ({
  status: 'offline',
  setStatus: (status) => set({ status }),
}))

export function useConnectionStatus(): ConnectionStatus {
  return useStore(connectionStore, (s) => s.status)
}
