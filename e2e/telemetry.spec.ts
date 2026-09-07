import { expect, test } from '@playwright/test'
import { emitMqtt, signIn } from './fixtures'

test('a telemetry message updates the dashboard panel', async ({ page }) => {
  await signIn(page, 'viewer')
  await expect(page.getByText(/waiting for readings/i)).toBeVisible()

  await emitMqtt(page, 'devices/d1/telemetry', { deviceId: 'd1', ts: Date.now(), temp: 42 })

  await expect(page.getByText('42°C')).toBeVisible()
})

test('the connection badge reports online', async ({ page }) => {
  await signIn(page, 'viewer')
  await expect(page.getByText('online', { exact: true })).toBeVisible()
})

// KNOWN FAILING — genuine bug in src, not flaky/environmental. Left red
// rather than weakened or skipped; see task-19-20-report.md. Root cause:
// `setOnline()` is only ever called from TelemetryPanel's onStatus handler
// (src/modules/devices/components/TelemetryPanel.tsx), and TelemetryPanel is
// only mounted on the dashboard route ('/'). useDeviceEvents (mounted on
// /devices) subscribes only to the `devices/events` topic, not
// `devices/+/status`. So navigating to /devices unsubscribes the only status
// handler (useMqttSubscription's cleanup unsubscribes on unmount), and a
// devices/d1/status message emitted while on /devices has no listener to
// update telemetryStore.online — the Boiler row's badge stays "unknown"
// forever. This is the row-scoped assertion from the dispatch override (the
// brief's original `.first()` would have matched the header's connection
// badge instead of the device row and passed for the wrong reason); the
// underlying feature gap is real regardless of locator choice.
test('a status message marks a device online in the list', async ({ page }) => {
  await signIn(page, 'admin')
  await page.goto('/devices')
  await emitMqtt(page, 'devices/d1/status', { deviceId: 'd1', online: true, ts: Date.now() })

  const row = page.getByRole('row').filter({ hasText: 'Boiler' })
  await expect(row.getByText('online')).toBeVisible()
})
