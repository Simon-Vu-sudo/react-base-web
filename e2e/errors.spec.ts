import { expect, test } from '@playwright/test'
import { signIn } from './fixtures'

test('an unknown URL renders the bare 404 page', async ({ page }) => {
  await signIn(page, 'admin')
  await page.goto('/no-such-page')
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
})

// KNOWN FAILING — genuine bug in src, not a flaky/environmental test. Left
// red rather than weakened or skipped so CI keeps reporting it; see the
// "genuine bugs found" section of task-19-20-report.md for the full
// investigation. Root cause: when a loader throws notFound() and the nearest
// ancestor route (`_auth`) resolves it via its own `notFoundComponent`,
// TanStack Router renders that notFoundComponent *in place of* `_auth`'s own
// `component` (AppShell) rather than nesting it inside AppShell's <Outlet/>.
// Verified by dumping the DOM: #root contains only ShellNotFound's markup —
// no <nav>, no header — even though `_auth.tsx`'s own comment says this
// state renders "inside the shell".
test('a missing device renders the in-shell not-found state', async ({ page }) => {
  await signIn(page, 'admin')
  await page.goto('/devices/d999')
  await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
})

// KNOWN FAILING — genuine bug in src, not flaky/environmental. Left red
// rather than weakened or skipped; see task-19-20-report.md. Root cause:
// `authStore.subscribe` in main.tsx calls `router.invalidate()` on every
// status change, including the transition into 'bootstrapError'. TanStack
// Router's internal history integration processes that invalidation (and
// runs `requireAuth`'s beforeLoad guard) independently of whether
// <RouterProvider> is actually mounted — and AppRoot never mounts it while
// status is 'bootstrapError' (it renders <ServerUnreachable/> instead). The
// guard's `status !== 'authenticated'` check does not distinguish
// 'bootstrapError' from 'unauthenticated', so it redirects, and the
// router's own history object pushes /login?redirect=%2F onto the real
// browser URL even though React never renders the login form — confirmed by
// polling `location.href` alongside the rendered DOM: the correct "Cannot
// reach the server" screen stays visible throughout, but the address bar
// silently changes underneath it. The visible UI is correct; the URL is not.
test('an unreachable server shows the retry screen, not a logout', async ({ page }) => {
  // Fail only the bootstrap call, so the app cannot tell whether we are signed in.
  await page.route('**/api/auth/me', (route) => route.abort('failed'))
  await page.goto('/')

  await expect(page.getByRole('heading', { name: /cannot reach the server/i })).toBeVisible()
  await expect(page).not.toHaveURL(/\/login/)
})
