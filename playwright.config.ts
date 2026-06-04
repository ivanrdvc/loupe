import { defineConfig, devices } from '@playwright/test'

// Dedicated port so the suite never reuses a running `pnpm dev` (3000).
const PORT = 3210
const baseURL = `http://localhost:${PORT}`
const FAKE_AGENT_PORT = 3211

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node e2e/fake-agent.mjs',
      url: `http://localhost:${FAKE_AGENT_PORT}`,
      reuseExistingServer: !process.env.CI,
      env: { FAKE_AGENT_PORT: String(FAKE_AGENT_PORT) },
    },
    {
      // Real production build (Nitro output), not the dev server.
      command: 'pnpm db:migrate && pnpm build && node .output/server/index.mjs',
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        DATABASE_URL: 'e2e.db',
        TELEMETRY_PROVIDER: 'fixtures',
        JUDGE_PROVIDER: 'fixtures',
        PORT: String(PORT),
        DATASET_RUN_ENDPOINT: `http://localhost:${FAKE_AGENT_PORT}/v1/responses`,
      },
    },
  ],
})
