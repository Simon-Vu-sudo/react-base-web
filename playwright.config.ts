import { defineConfig, devices } from '@playwright/test'

const PORT = 4173

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Multiple Chromium instances hammering `vite preview`'s single-threaded
  // static server concurrently on Windows produced spurious `page.goto`
  // "load" timeouts (a whole spec file failing every test) that vanished
  // under a single worker. CI runs on ubuntu-latest, where this did not
  // reproduce, so only serialize locally.
  workers: process.env.CI ? undefined : 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_API_URL: '/api',
      VITE_MQTT_URL: 'ws://localhost:9001/mqtt',
      VITE_MQTT_TRANSPORT: 'fake',
      VITE_ENABLE_CSRF: 'false',
    },
  },
})
