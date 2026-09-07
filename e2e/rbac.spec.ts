import { expect, test } from '@playwright/test'
import { signIn } from './fixtures'

test('an admin sees every nav item', async ({ page }) => {
  await signIn(page, 'admin')
  await expect(page.getByRole('link', { name: 'Devices' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Users' })).toBeVisible()
})

test('a viewer does not see the Users nav item', async ({ page }) => {
  await signIn(page, 'viewer')
  await expect(page.getByRole('link', { name: 'Devices' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0)
})

test('a viewer navigating directly to /admin/users lands on forbidden with the shell', async ({
  page,
}) => {
  await signIn(page, 'viewer')
  await page.goto('/admin/users')

  await expect(page).toHaveURL(/\/forbidden/)
  await expect(page.getByRole('heading', { name: 'Not permitted' })).toBeVisible()
  // The sidebar must still be there — a 403 should not be a dead end.
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
})

test('an operator can open device settings', async ({ page }) => {
  await signIn(page, 'operator')
  await page.goto('/devices/d1/settings')
  await expect(page.getByLabel('Name')).toBeVisible()
})

test('a viewer cannot open device settings', async ({ page }) => {
  await signIn(page, 'viewer')
  await page.goto('/devices/d1/settings')
  await expect(page).toHaveURL(/\/forbidden/)
})

test('only an admin sees the delete control', async ({ page }) => {
  await signIn(page, 'admin')
  await page.goto('/devices')
  await expect(page.getByRole('button', { name: 'Delete' }).first()).toBeVisible()
})

test('an operator does not see the delete control', async ({ page }) => {
  await signIn(page, 'operator')
  await page.goto('/devices')
  await expect(page.getByRole('link', { name: 'Boiler' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0)
})
