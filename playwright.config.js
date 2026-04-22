import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for visual regression. v1 scope targets public,
 * unauthenticated routes only; the dashboard baseline is tracked in
 * issue #80 pending a Firestore-emulator or auth-bypass strategy.
 *
 * CI integration is deferred until the baseline has proven stable
 * locally. Run tests with `npm run test:e2e`.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /.*\.spec\.(js|ts)/,
  timeout: 30_000,
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    },
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    // `vite preview` serves the built bundle. Deterministic and fast to
    // warm up compared to the dev server, which is what we want for
    // visual snapshots.
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
})
