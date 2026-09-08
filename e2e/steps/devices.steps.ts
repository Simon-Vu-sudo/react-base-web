import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'

const { Then } = createBdd()

/**
 * Same reasoning as the navigation-item visibility step: a Scenario Outline
 * substitutes <visibility> as plain text, so one regex step serves both the
 * "see" and "not see" rows instead of two near-identical step functions.
 */
Then(
  /^I should (see|not see) a delete button for device "([^"]+)"$/,
  async ({ page }, visibility: string, deviceName: string) => {
    const row = page.getByRole('row', { name: deviceName })
    const deleteButton = row.getByRole('button', { name: 'Delete' })
    if (visibility === 'see') {
      await expect(deleteButton).toBeVisible()
    } else {
      await expect(deleteButton).toHaveCount(0)
    }
  },
)
