import { expect, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { PASSWORD, emailForRole } from '../support/testData'

const { Given, When, Then } = createBdd()

async function submitLoginForm(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

Given('I am on the login page', async ({ page }) => {
  await page.goto('/login')
})

Given('I am signed out', async () => {
  // Every scenario gets a fresh, unauthenticated browser context — this step
  // exists only to make that starting state explicit to a reader of the
  // feature file, not to do anything itself.
})

/**
 * The one login helper every other feature leans on: maps a role name to its
 * seeded account (see `src/dev/fakeApi.ts`), signs in for real through the
 * form, and waits for the dashboard so later steps never race the redirect.
 */
Given('I am signed in as {string}', async ({ page }, role: string) => {
  await page.goto('/login')
  await submitLoginForm(page, emailForRole(role), PASSWORD)
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
})

When('I sign in with email {string} and password {string}', async ({ page }, email: string, password: string) => {
  await submitLoginForm(page, email, password)
})

When('I sign out', async ({ page }) => {
  await page.getByRole('button', { name: 'Sign out' }).click()
})

When('I go back in the browser', async ({ page }) => {
  await page.goBack()
})

Then('I should be on the dashboard', async ({ page }) => {
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
})

Then('I should be on the login page', async ({ page }) => {
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})

Then('I should be redirected to the login page', async ({ page }) => {
  await expect(page).toHaveURL(/\/login\?redirect=/)
})

Then('I should see the error message {string}', async ({ page }, message: string) => {
  await expect(page.getByRole('alert')).toHaveText(message)
})

Then('I should see the validation message {string}', async ({ page }, message: string) => {
  await expect(page.getByText(message)).toBeVisible()
})

Then('I should be on {string}', async ({ page }, path: string) => {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  await expect(page).toHaveURL(new RegExp(`${escaped}$`))
})

/**
 * Deliberately does not assert *which* page Back lands on. The app's guards
 * use replace-navigation throughout the auth flow (sign-in and the logout
 * redirect both replace rather than push), so "Back" from a freshly opened
 * tab can skip straight past the login page to whatever came before it in
 * this browser context — the point is only that the authenticated app never
 * reappears.
 */
Then('I should not see the dashboard', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toHaveCount(0)
})
