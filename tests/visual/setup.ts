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
