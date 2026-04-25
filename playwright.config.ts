import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/visual',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'mobile-375', use: { ...devices['Pixel 5'], viewport: { width: 375, height: 667 } } },
    { name: 'tablet-768', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'desktop-1280', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    // Build with the E2E bypass flag enabled, then serve via `vite preview`.
    // We deliberately avoid `vite dev` here: dev mode lazy-transforms modules
    // on first import, which can cause routes that weren't navigated during a
    // test run to serve stale chrome from a previous build's cache, producing
    // false-pass visual diffs. A real production build eliminates that risk.
    // VITE_E2E_BYPASS=1 keeps the test-only auth bypass alive in the bundle;
    // production deploys never set this var.
    command: 'cross-env VITE_E2E_BYPASS=1 npm run build && npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' },
  },
})
