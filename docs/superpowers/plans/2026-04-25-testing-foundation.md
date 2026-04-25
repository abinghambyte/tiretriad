# Testing foundation — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Implement Tier 1 of the testing foundation — Playwright + visual snapshots + axe-core in CI on 5 routes × 3 viewports, plus Sentry.

**Spec:** `docs/superpowers/specs/2026-04-25-testing-foundation-design.md`

**Architecture:** New `tests/visual/` directory using `@playwright/test`. New CI workflow runs the build + serves the dist + runs Playwright. Sentry init in `src/main.jsx` gated to `PROD`.

**Tech Stack:** Playwright 1.45+, `@axe-core/playwright`, `@sentry/react`.

---

## Task 1 — Install + configure Playwright

**Files:**
- Modify: `package.json`
- Create: `playwright.config.ts`
- Create: `tests/visual/setup.ts`

- [ ] **Step 1: Install dev deps**

```
npm i -D @playwright/test @axe-core/playwright
npx playwright install --with-deps chromium
```

- [ ] **Step 2: Create `playwright.config.ts`**

```ts
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
    command: 'npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
  },
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' },
  },
})
```

- [ ] **Step 3: Add npm scripts**

In `package.json`:

```json
"scripts": {
  ...
  "test:visual": "playwright test",
  "test:visual:update": "playwright test --update-snapshots",
  "test:visual:ui": "playwright test --ui"
}
```

- [ ] **Step 4: Create auth helper at `tests/visual/setup.ts`**

```ts
import { test as base, type Page } from '@playwright/test'

/**
 * For Tier 1 we use a hard-coded fixture admin login.
 * Replace with Firebase Auth emulator integration in Tier 2.
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/')
  // TODO: replace with actual auth flow once we know which path works in CI.
  // For now, bypass via a localStorage seed if the app supports a test mode.
  await page.evaluate(() => {
    window.localStorage.setItem('skedaddle.test.bypassAuth', '1')
    window.localStorage.setItem('skedaddle.test.role', 'admin')
  })
  await page.reload()
}

export const test = base.extend<{ adminPage: Page }>({
  adminPage: async ({ page }, use) => {
    await loginAsAdmin(page)
    await use(page)
  },
})

export { expect } from '@playwright/test'
```

**Note for the implementer:** the auth bypass mechanism may need to be added to `src/firebase/config.js` or wherever auth is gated. Add a TODO and document. If implementing the bypass is too invasive, fall back to feeding a test user's credentials via env vars and going through real Firebase Auth — slower but no app changes.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json playwright.config.ts tests/visual/setup.ts
git commit -m "Install Playwright + configure for 3 viewports"
```

---

## Task 2 — Visual snapshot tests for 5 routes

**Files:**
- Create: `tests/visual/routes.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from './setup'

const ROUTES = [
  { path: '/', name: 'dashboard' },
  { path: '/tires', name: 'tires' },
  { path: '/orders', name: 'orders' },
  { path: '/people?tab=crew', name: 'people-crew' },
  { path: '/crm', name: 'crm' },
] as const

for (const route of ROUTES) {
  test(`${route.name} matches snapshot`, async ({ adminPage }) => {
    await adminPage.goto(route.path)
    await adminPage.waitForLoadState('networkidle')
    // Pause any in-flight animations (the activity ticker etc.)
    await adminPage.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' })
    await expect(adminPage).toHaveScreenshot(`${route.name}.png`, { fullPage: true })
  })
}
```

- [ ] **Step 2: Generate baselines**

```
npm run build
npm run test:visual:update
```

This runs the full suite (5 routes × 3 viewports = 15 tests) and writes baseline images to `tests/visual/__snapshots__/`. Inspect them visually before committing.

- [ ] **Step 3: Run again to confirm stability**

```
npm run test:visual
```

Expected: 15/15 pass. If anything fails on the second run, there's flakiness — investigate and silence the source.

- [ ] **Step 4: Commit baselines**

```bash
git add tests/visual/routes.spec.ts tests/visual/__snapshots__/
git commit -m "Add visual snapshot baselines for 5 routes × 3 viewports"
```

---

## Task 3 — axe-core a11y scan

**Files:**
- Create: `tests/visual/a11y.spec.ts`
- Create: `tests/visual/axe-disabled-rules.json`

- [ ] **Step 1: Disabled-rules file**

```json
{
  "rules": [],
  "note": "Add rule IDs here with a justification comment when intentionally suppressing. Each entry must include why and a date."
}
```

- [ ] **Step 2: Test spec**

```ts
import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './setup'
import disabled from './axe-disabled-rules.json'

const ROUTES = [
  { path: '/', name: 'dashboard' },
  { path: '/tires', name: 'tires' },
  { path: '/orders', name: 'orders' },
  { path: '/people?tab=crew', name: 'people-crew' },
  { path: '/crm', name: 'crm' },
]

for (const route of ROUTES) {
  test(`${route.name} has no serious or critical a11y violations`, async ({ adminPage }) => {
    await adminPage.goto(route.path)
    await adminPage.waitForLoadState('networkidle')
    const builder = new AxeBuilder({ page: adminPage })
      .withTags(['wcag2a', 'wcag2aa'])
    if (disabled.rules.length) builder.disableRules(disabled.rules)
    const results = await builder.analyze()
    const blockers = results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
    expect(blockers, JSON.stringify(blockers, null, 2)).toEqual([])
  })
}
```

- [ ] **Step 3: Run + triage**

```
npm run test:visual -- a11y.spec.ts
```

Expected: failures are likely. For each failure, decide: fix in this PR (small) or add the rule to `axe-disabled-rules.json` with a comment + date + GitHub issue link.

- [ ] **Step 4: Commit**

```bash
git add tests/visual/a11y.spec.ts tests/visual/axe-disabled-rules.json
git commit -m "Add axe-core a11y scan for 5 routes × 3 viewports"
```

---

## Task 4 — CI workflow

**Files:**
- Create: `.github/workflows/visual-tests.yml`

- [ ] **Step 1: Workflow**

```yaml
name: Visual + a11y tests
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  visual:
    timeout-minutes: 12
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm
      - run: npm ci
      - name: Cache Playwright browsers
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ hashFiles('package-lock.json') }}
      - run: npx playwright install --with-deps chromium
      - run: npm run build
      - run: npm run test:visual
      - name: Upload Playwright report
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 14
```

- [ ] **Step 2: Verify locally before pushing**

```
npm run build && npm run test:visual
```

- [ ] **Step 3: Push, watch the first CI run, fix any platform-specific snapshot drift**

CI runs on Ubuntu — fonts and rendering may diff slightly from local Windows/macOS. Plan: regenerate snapshots in CI by running `npm run test:visual:update` on a Linux container locally if possible, or accept the first CI run's drift as the baseline.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/visual-tests.yml
git commit -m "Run visual + a11y tests in CI on every PR"
```

---

## Task 5 — Sentry integration

**Files:**
- Modify: `package.json` (add `@sentry/react`)
- Create: `src/sentry.js`
- Modify: `src/main.jsx`
- Modify: `.env.example`
- Document: Vercel env var

- [ ] **Step 1: Install**

```
npm i @sentry/react
```

- [ ] **Step 2: `src/sentry.js`**

```js
import * as Sentry from '@sentry/react'

export function initSentry() {
  if (!import.meta.env.PROD) return
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) {
    console.warn('Sentry DSN missing in production — error tracking disabled')
    return
  }
  Sentry.init({
    dsn,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_RELEASE_SHA || 'unknown',
  })
}

export { Sentry }
```

- [ ] **Step 3: Wire into `src/main.jsx`**

Add at the top, before any React rendering:

```js
import { initSentry } from './sentry.js'
initSentry()
```

- [ ] **Step 4: Update `.env.example`**

```
VITE_SENTRY_DSN=
VITE_RELEASE_SHA=
```

- [ ] **Step 5: Document in README under "Production deploy"**

> **Sentry:** in Vercel project settings, set `VITE_SENTRY_DSN` to the Skedaddle Sentry project DSN. Set `VITE_RELEASE_SHA` to `$VERCEL_GIT_COMMIT_SHA` (Vercel system env).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Wire Sentry for production error tracking"
```

---

## Task 6 — Final verification + PR

- [ ] **Step 1: Full validation**

```
npm run lint
npm run test           # vitest, must still pass
npm run build
npm run test:visual    # playwright, must pass
```

- [ ] **Step 2: Push branch + open PR**

```
git push -u origin testing-foundation
gh pr create --title "Testing foundation: Playwright + axe + Sentry" --body "(spec link, what runs, runtime budget)"
```

PR description should include:
- Link to spec doc
- Sample of a snapshot diff so reviewers know what to expect
- Manual: "After merge, set `VITE_SENTRY_DSN` in Vercel"

---

## Self-review

- [x] **Spec coverage:** Each spec section has a Task: Playwright config → 1; routes → 2; axe → 3; CI → 4; Sentry → 5.
- [x] **No placeholders.**
- [x] **Auth bypass marked TODO with implementer note.** That's the one piece this plan can't fully nail down without seeing the auth code; flagged as a known investigation point in Task 1 Step 4.
