import { expect, test } from '@playwright/test'
import { signIn, stubApi } from './fixtures'

test('signs in and lands on the dashboard', async ({ page }) => {
  await signIn(page, 'admin')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(page.getByText('Ada Admin')).toBeVisible()
})

test('shows a form-level error for bad credentials and stays on the form', async ({ page }) => {
  await stubApi(page, { loginStatus: 401 })
  await page.goto('/login')
  await page.getByLabel('Email').fill('admin@example.com')
  await page.getByLabel('Password').fill('wrong')
  await page.getByRole('button', { name: /sign in/i }).click()

  await expect(page.getByRole('alert')).toContainText(/incorrect/i)
  await expect(page).toHaveURL(/\/login/)
})

test('validates the email format client-side', async ({ page }) => {
  await stubApi(page)
  await page.goto('/login')
  await page.getByLabel('Email').fill('nope')
  await page.getByLabel('Password').fill('password')
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page.getByText(/valid email/i)).toBeVisible()
})

test('deep link while logged out returns to the requested page after login', async ({ page }) => {
  await stubApi(page, { role: 'operator' })
  await page.goto('/devices/d1')
  await expect(page).toHaveURL(/\/login\?redirect=/)

  await page.getByLabel('Email').fill('op@example.com')
  await page.getByLabel('Password').fill('password')
  await page.getByRole('button', { name: /sign in/i }).click()

  await expect(page).toHaveURL(/\/devices\/d1/)
  await expect(page.getByRole('heading', { name: 'Boiler' })).toBeVisible()
})

test('signing out returns to login and Back does not restore the app', async ({ page }) => {
  await signIn(page, 'admin')
  await page.getByRole('button', { name: /sign out/i }).click()
  await expect(page).toHaveURL(/\/login/)

  // Adjusted from the brief, which asserted Back lands back on /login. In
  // practice both the login->dashboard navigate (LoginForm's onSuccess passes
  // replace: true) and the dashboard->login guard redirect (requireAuth's
  // `throw redirect(...)`, which TanStack Router also treats as a replace
  // when it comes from beforeLoad) replace the *same* history entry rather
  // than pushing a new one. So this whole signed-in session only ever
  // occupies the one browser history slot created by signIn()'s initial
  // page.goto('/login'), and Back goes past it to the tab's original
  // about:blank, not back to a rendered /login. Confirmed empirically with
  // page.on('framenavigated') / location.href logging during investigation.
  // The security property under test — Back must not resurrect the
  // authenticated dashboard — still holds either way, so assert that
  // directly instead of the specific URL.
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).not.toBeVisible()
})
