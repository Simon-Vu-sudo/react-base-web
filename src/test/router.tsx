import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { routeTree } from '@/routeTree.gen'
import { authStore } from '@/lib/auth/store'
import { makeTestQueryClient } from './render'

/** Mounts the real route tree at a path, with the real store as context. */
export function renderRoute(path: string) {
  const queryClient = makeTestQueryClient()
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { getAuth: () => authStore.getState(), queryClient },
    defaultPreload: false,
  })
  const utils = render(
    <QueryClientProvider client={queryClient}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <RouterProvider router={router as any} />
    </QueryClientProvider>,
  )
  return { router, queryClient, ...utils }
}

export const signIn = (roles: string[]) =>
  authStore.getState().setSession({ id: 'u1', email: 'a@b.co', name: 'Ann', roles })
