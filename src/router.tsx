import { createRouter } from '@tanstack/react-router'
import { routeTree } from '@/routeTree.gen'
import { authStore } from '@/lib/auth/store'
import { queryClient } from '@/lib/query/client'

export const router = createRouter({
  routeTree,
  context: {
    getAuth: () => authStore.getState(),
    queryClient,
  },
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
