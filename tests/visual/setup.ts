import { test as base, type Page } from '@playwright/test'

/**
 * For Tier 1 we use a localStorage-seeded admin login. Setting the seed via
 * `addInitScript` runs the snippet before any page navigation, so the very
 * first request renders as the bypassed admin — no extra round-trip and no
 * brief flash of the unauthenticated app.
 *
 * The corresponding `src/`-side handler that consumes these flags has not
 * been wired yet. Whoever wires it MUST gate the read on a build-time flag
 * (`import.meta.env.DEV` or a dedicated `VITE_E2E_BYPASS`) so the production
 * bundle never honors them.
 *
 * Replace with Firebase Auth emulator integration in Tier 2.
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('skedaddle.test.bypassAuth', '1')
    window.localStorage.setItem('skedaddle.test.role', 'admin')
  })
}

export const test = base.extend<{ adminPage: Page }>({
  adminPage: async ({ page }, use) => {
    await loginAsAdmin(page)
    await use(page)
  },
})

export { expect } from '@playwright/test'
