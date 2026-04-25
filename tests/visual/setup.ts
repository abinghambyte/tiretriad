import { test as base, type Page } from '@playwright/test'

const FIRESTORE_HOSTS = /firestore\.googleapis\.com|firebaseio\.com|googleapis\.com\/.*firestore/

/**
 * For Tier 1 we use a localStorage-seeded admin login plus a hard-fail of
 * Firestore network calls. Setting the seed via `addInitScript` runs the
 * snippet before any page navigation, so the very first request renders as
 * the bypassed admin — no extra round-trip and no brief flash of the
 * unauthenticated app.
 *
 * The bypass admin has no real Firestore permissions, so realtime listeners
 * would otherwise enter retry/backoff with non-deterministic timing.
 * Aborting Firestore at the network layer makes each query reject
 * immediately and the rendered output stabilizes on its empty / error state.
 * Tier 1 is a chrome-regression net (top bar, nav, popovers, sticky stacking,
 * breakpoints) — data-state coverage is a Tier 2 / emulator concern.
 *
 * The src-side bypass handler is gated on `import.meta.env.DEV`, so the
 * production bundle never honors these localStorage flags.
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('skedaddle.test.bypassAuth', '1')
    window.localStorage.setItem('skedaddle.test.role', 'admin')
  })
  await page.route(FIRESTORE_HOSTS, (r) => r.abort())
}

/**
 * Standard navigate + settle dance for visual / a11y tests.
 * `networkidle` is unreliable in dev (Vite HMR socket never idles); use
 * `load` plus a short fixed settle to give the synchronous render after
 * data rejection time to land. Then disable all animations so snapshots
 * are deterministic.
 */
export async function gotoAndSettle(page: Page, path: string): Promise<void> {
  await page.goto(path)
  await page.waitForLoadState('load')
  await page.waitForTimeout(8000)
  await page.addStyleTag({
    content: '*, *::before, *::after { animation: none !important; transition: none !important; }',
  })
}

export const test = base.extend<{ adminPage: Page }>({
  adminPage: async ({ page }, use) => {
    await loginAsAdmin(page)
    await use(page)
  },
})

export { expect } from '@playwright/test'
