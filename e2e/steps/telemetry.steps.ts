import { expect, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { idForDevice } from '../support/testData'

const { When, Then } = createBdd()

type FakeMqttWindow = { __mqttFake?: { emit: (topic: string, payload: unknown) => void } }

/**
 * The subscription that would receive our injected message is only wired up
 * once the (fake) MQTT connection reaches "online" — the same word the
 * header's connection badge shows. This is a technical precondition, not
 * something a scenario is testing, so it stays out of the Gherkin and lives
 * here instead.
 */
async function waitForMqttOnline(page: Page): Promise<void> {
  await expect(page.locator('header').getByText('online', { exact: true })).toBeVisible()
}

async function emitMqtt(page: Page, topic: string, payload: unknown): Promise<void> {
  await waitForMqttOnline(page)
  await page.evaluate(
    ({ topic, payload }: { topic: string; payload: unknown }) => {
      const fake = (window as unknown as FakeMqttWindow).__mqttFake
      if (!fake) throw new Error('window.__mqttFake is not installed — is VITE_MQTT_TRANSPORT=fake set?')
      fake.emit(topic, payload)
    },
    { topic, payload },
  )
}

When('a telemetry reading of {string} arrives for device {string}', async ({ page }, reading: string, deviceName: string) => {
  const id = idForDevice(deviceName)
  const temp = Number(reading.replace(/[^\d.-]/g, ''))
  await emitMqtt(page, `devices/${id}/telemetry`, { deviceId: id, ts: Date.now(), temp })
})

When('device {string} comes online', async ({ page }, deviceName: string) => {
  const id = idForDevice(deviceName)
  await emitMqtt(page, `devices/${id}/status`, { deviceId: id, online: true, ts: Date.now() })
})

Then(
  'the dashboard should show a temperature of {string} for device {string}',
  async ({ page }, reading: string, deviceName: string) => {
    const id = idForDevice(deviceName)
    const row = page.getByRole('row', { name: id })
    await expect(row.getByText(reading, { exact: true })).toBeVisible()
  },
)

Then('the {string} device row should show {string}', async ({ page }, deviceName: string, status: string) => {
  const row = page.getByRole('row', { name: deviceName })
  await expect(row.getByText(status, { exact: true })).toBeVisible()
})
