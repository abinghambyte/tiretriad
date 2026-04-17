/**
 * Headed Playwright: open skedaddleinc.com, you sign in and open /dashboard,
 * then press Enter in this terminal to save storage state (gitignored).
 *
 * From repo root: node scripts/capture-auth-state.mjs
 */
import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const outDir = path.join(repoRoot, 'docs', 'audit-storage')
const outFile = path.join(outDir, 'overwatch-state.json')

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true })
}

let browser
try {
  browser = await chromium.launch({ headless: false, channel: 'chrome' })
} catch {
  browser = await chromium.launch({ headless: false })
}

const context = await browser.newContext()
const page = await context.newPage()
await page.goto('https://www.skedaddleinc.com/', { waitUntil: 'domcontentloaded', timeout: 120_000 })

console.log('\nLog in now. When /dashboard has loaded, press Enter in this terminal to save state.\n')

await new Promise((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  rl.question('', () => {
    rl.close()
    resolve()
  })
})

await context.storageState({
  path: outFile,
  indexedDB: true,
})
await browser.close()

const st = fs.statSync(outFile)
if (!st.size) {
  console.error('Saved file is empty.')
  process.exit(1)
}
