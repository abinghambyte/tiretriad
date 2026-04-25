import { defineConfig, devices } from '@playwright/test'

/**
 * @deprecated Pending deletion in the testing-foundation Task 4.
 * Superseded by `playwright.config.ts` which targets `tests/visual/`.
 * Do not edit — Playwright auto-picks the .ts config; this file only
 * still runs when invoked explicitly with `--config playwright.config.js`.
 *
 * Original v1 scope: visual regression on public unauthenticated routes
 * only; dashboard baseline tracked in issue #80 pending auth-bypass.
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
