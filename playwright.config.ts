import { defineConfig, devices } from '@playwright/test'
import { defineBddConfig } from 'playwright-bdd'

const PORT = 5173

const testDir = defineBddConfig({
  features: 'e2e/features/**/*.feature',
  steps: 'e2e/steps/**/*.ts',
})

export default defineConfig({
  testDir,
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
    // Runs the Vite *dev* server, not a production build. The fake API/MQTT
    // shims are gated on `import.meta.env.DEV`, which Vite inlines as a
    // literal `false` in a production build — `npm run build && npm run
    // preview` drops the shims (and the seed accounts) entirely, leaving no
    // way to log in. CI runs `npm run build` as its own separate step, so the
    // production bundle stays verified — it just is not the thing exercised
    // in a browser here.
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_API_TRANSPORT: 'fake',
      VITE_MQTT_TRANSPORT: 'fake',
      VITE_MQTT_URL: 'ws://localhost:9001/mqtt',
      VITE_API_URL: `http://localhost:${PORT}/api`,
    },
  },
})
