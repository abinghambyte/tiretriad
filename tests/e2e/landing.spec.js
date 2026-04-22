import { test, expect } from '@playwright/test'

/**
 * Visual baseline for the public LandingPage at `/`. When no user is
 * signed in, the LandingPage renders the LoginForm instead of
 * redirecting - that is the snapshot we lock.
 *
 * The dashboard baseline is tracked separately in issue #80 and is not
 * yet part of this suite; it needs an auth-bypass or emulator story
 * before it can be captured deterministically.
 */
test.describe('LandingPage visual baseline', () => {
  test('signed-out landing at 1440 desktop', async ({ page }) => {
    await page.goto('/')
    // LoginForm is rendered once `useAuth` resolves loading: false and
    // sees no user. Wait for its heading/submit rather than a raw
    // networkidle, which Firebase auth keeps busy.
    await page.getByRole('button', { name: /sign in|log in|continue/i }).waitFor({ timeout: 10_000 })
    await expect(page).toHaveScreenshot('landing-signed-out-1440.png', {
      fullPage: true,
    })
  })
})
