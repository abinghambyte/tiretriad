/**
 * Fully automated authenticated UI capture — NO stdin / readline / user input.
 * Loads docs/audit-storage/overwatch-state.json (auth + IndexedDB) and screenshots
 * portal routes at two viewports × light/dark (portal theme via skedaddle-theme + reload).
 *
 * Usage: node scripts/audit-authenticated-capture.mjs
 */
import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const storagePath = path.join(repoRoot, 'docs', 'audit-storage', 'overwatch-state.json')
const outDir = path.join(repoRoot, 'docs', 'audit-screenshots')
const metricsPath = path.join(outDir, 'metrics-authenticated.json')

const BASE = 'https://www.skedaddleinc.com'

/**
 * themeMode:
 * - `portal` — set skedaddle-theme + reload (Skedaddle pages only).
 * - `emulate` — use Playwright context colorScheme only (for /dispatch after external redirect).
 */
const ROUTES = [
  { path: '/dashboard', label: 'dashboard', themeMode: 'portal' },
  { path: '/tires', label: 'tires-catalog', themeMode: 'portal' },
  { path: '/tires?tab=orders', label: 'tires-orders', themeMode: 'portal' },
  { path: '/crm', label: 'crm-board', themeMode: 'portal' },
  { path: '/crm?tab=leads', label: 'crm-leads', themeMode: 'portal' },
  { path: '/crm/dispatch', label: 'crm-dispatch', themeMode: 'portal' },
  { path: '/people', label: 'people-crew', themeMode: 'portal' },
  { path: '/people?tab=customers', label: 'people-customers', themeMode: 'portal' },
  { path: '/analytics', label: 'analytics-wall', themeMode: 'portal' },
  { path: '/analytics?tab=metrics', label: 'analytics-metrics', themeMode: 'portal' },
  { path: '/analytics?tab=revenue', label: 'analytics-revenue', themeMode: 'portal' },
  { path: '/analytics?tab=leaderboard', label: 'analytics-leaderboard', themeMode: 'portal' },
  { path: '/ops', label: 'ops', themeMode: 'portal' },
  { path: '/dispatch', label: 'dispatch-redirect', themeMode: 'emulate' },
]

const VIEWPORTS = [
  { w: 1440, h: 900, tag: 'desktop-1440' },
  { w: 390, h: 844, tag: 'mobile-390' },
]

const THEMES = ['light', 'dark']

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function log(msg) {
  process.stdout.write(`${msg}\n`)
}

async function applyPortalTheme(page, theme) {
  await page.evaluate((t) => {
    try {
      localStorage.setItem('skedaddle-theme', t === 'light' ? 'light' : 'dark')
    } catch {
      /* ignore */
    }
  }, theme)
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 })
  await page.waitForTimeout(2500)
}

async function measurePage(page) {
  return page.evaluate(() => {
    const el = document.documentElement
    const body = document.body
    const scrollWidth = Math.max(el.scrollWidth, body ? body.scrollWidth : 0)
    const clientWidth = el.clientWidth
    const nav = performance.getEntriesByType('navigation')[0] || {}
    return {
      url: window.location.href,
      title: document.title,
      scrollWidth,
      clientWidth,
      horizontalOverflow: scrollWidth > clientWidth + 2,
      domContentLoaded: nav.domContentLoadedEventEnd,
      loadEventEnd: nav.loadEventEnd,
    }
  })
}

async function captureListingModal(browser, vp, theme, results) {
  const context = await browser.newContext({
    storageState: storagePath,
    viewport: { width: vp.w, height: vp.h },
    ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()
  page.setDefaultTimeout(120_000)
  const started = Date.now()
  const label = 'tires-listing-generator-modal'
  const fname = `auth__${label}__${vp.tag}__${theme}.png`
  log(`[audit] ${label} ${vp.tag} ${theme}`)
  try {
    await page.goto(`${BASE}/tires`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await page.waitForTimeout(4000)
    await applyPortalTheme(page, theme)

    const rowCb = page.getByRole('checkbox', { name: /^Select / }).first()
    await rowCb.waitFor({ state: 'visible', timeout: 90_000 })
    await rowCb.click({ timeout: 15_000 })

    await page.getByRole('button', { name: 'Generate listings' }).click({ timeout: 15_000 })
    await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 30_000 })
    await page.waitForTimeout(800)

    const metrics = await measurePage(page)
    await page.screenshot({ path: path.join(outDir, fname), fullPage: false })
    results.push({
      route: '/tires',
      label,
      viewport: vp.tag,
      theme,
      themeMode: 'portal',
      navOk: true,
      screenshot: `docs/audit-screenshots/${fname}`,
      wallMs: Date.now() - started,
      ...metrics,
    })

    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  } catch (e) {
    results.push({
      route: '/tires',
      label,
      viewport: vp.tag,
      theme,
      themeMode: 'portal',
      navOk: false,
      error: String(e.message || e),
      wallMs: Date.now() - started,
    })
  }
  await context.close()
}

async function main() {
  if (!fs.existsSync(storagePath)) {
    console.error(`Missing ${path.relative(repoRoot, storagePath)} — run capture-auth-state first.`)
    process.exit(1)
  }

  ensureDir(outDir)
  const browser = await chromium.launch({ headless: true })
  const results = []

  try {
    for (const route of ROUTES) {
      for (const vp of VIEWPORTS) {
        for (const theme of THEMES) {
          const themeMode = route.themeMode || 'portal'
          const context = await browser.newContext({
            storageState: storagePath,
            viewport: { width: vp.w, height: vp.h },
            ignoreHTTPSErrors: true,
            ...(themeMode === 'emulate' ? { colorScheme: theme } : {}),
          })
          const page = await context.newPage()
          page.setDefaultTimeout(120_000)
          const url = `${BASE}${route.path}`
          const started = Date.now()
          log(`[audit] ${route.label} ${vp.tag} ${theme} (${themeMode})`)
          try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 })
            await page.waitForTimeout(3000)

            if (themeMode === 'portal') {
              await applyPortalTheme(page, theme)
            } else {
              await page.waitForTimeout(2000)
            }

            const metrics = await measurePage(page)
            const fname = `auth__${route.label}__${vp.tag}__${theme}.png`
            await page.screenshot({ path: path.join(outDir, fname), fullPage: false })
            results.push({
              route: route.path,
              label: route.label,
              viewport: vp.tag,
              theme,
              themeMode,
              navOk: true,
              screenshot: `docs/audit-screenshots/${fname}`,
              wallMs: Date.now() - started,
              ...metrics,
            })
          } catch (e) {
            results.push({
              route: route.path,
              label: route.label,
              viewport: vp.tag,
              theme,
              themeMode,
              navOk: false,
              error: String(e.message || e),
              wallMs: Date.now() - started,
            })
          }
          await context.close()
        }
      }
    }

    for (const vp of VIEWPORTS) {
      for (const theme of THEMES) {
        await captureListingModal(browser, vp, theme, results)
      }
    }
  } finally {
    await browser.close()
  }

  fs.writeFileSync(metricsPath, JSON.stringify(results, null, 2), 'utf8')
  log(`Done. Wrote ${results.length} records to ${path.relative(repoRoot, metricsPath)}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
