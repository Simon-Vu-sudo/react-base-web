import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'

const { Given, When, Then } = createBdd()

/**
 * Clicks the sidebar link rather than `page.goto`, so navigation stays
 * client-side (TanStack Router, no full reload) — several scenarios (e.g.
 * `telemetry.feature`) rely on in-memory state surviving the trip between
 * pages the way it would for a real user clicking around.
 */
Given('I am on the {string} page', async ({ page }, label: string) => {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: label, exact: true }).click()
  await expect(page.getByRole('heading', { name: label, level: 1 })).toBeVisible()
})

/** Direct URL entry — a real navigation/reload, unlike the step above. */
When('I visit {string}', async ({ page }, path: string) => {
  await page.goto(path)
})

Then('I should see the {string} heading', async ({ page }, text: string) => {
  await expect(page.getByRole('heading', { name: text })).toBeVisible()
})

Then('the sidebar should still be visible', async ({ page }) => {
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
})

/**
 * Handles both "I should see ..." and "I should not see ..." from one step.
 * A Scenario Outline substitutes <visibility> as plain text ("see" / "not
 * see") rather than a quoted cucumber-expression argument, so a regex step
 * (rather than {string}) is what lets one implementation serve both rows of
 * the Examples table without near-duplicate step functions.
 */
Then(/^I should (see|not see) the "([^"]+)" navigation item$/, async ({ page }, visibility: string, label: string) => {
  const item = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: label, exact: true })
  if (visibility === 'see') {
    await expect(item).toBeVisible()
  } else {
    await expect(item).toHaveCount(0)
  }
})
