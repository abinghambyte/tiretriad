/**
 * Quarterly auto-audit. Runs Playwright (visual snapshot diff vs committed
 * baselines), axe-core (WCAG violations), and Lighthouse (perf + a11y +
 * best-practices) against production. Writes findings to a dated markdown
 * file in docs/superpowers/audits/.
 */
import { execSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROUTES = ['https://skedaddleinc.com/', 'https://skedaddleinc.com/tires', 'https://skedaddleinc.com/orders']

export function buildQuarterlyAuditMarkdown({ today = new Date().toISOString().slice(0, 10), runCommand = execSync } = {}) {
  const sections = []
  sections.push(`# Quarterly auto-audit - ${today}\n`)
  sections.push('Auto-generated. Triage findings into follow-up issues or close the PR.\n')

  // --- Playwright (visual + a11y) ---
  sections.push('\n## Playwright visual + a11y\n')
  try {
    const out = runCommand('npm run test:visual', { encoding: 'utf8' })
    sections.push('```\n' + out.slice(-4000) + '\n```\n')
  } catch (e) {
    const out = [e.stdout, e.stderr].filter(Boolean).join('\n') || e.message
    sections.push('```\n' + out.slice(-4000) + '\n```\n')
  }

  // --- Lighthouse ---
  sections.push('\n## Lighthouse (mobile preset)\n')
  for (const url of ROUTES) {
    try {
      const out = runCommand(`npx lighthouse "${url}" --quiet --chrome-flags="--headless" --preset=desktop --output=json --output-path=stdout`, { encoding: 'utf8' })
      const json = JSON.parse(out)
      const scores = {
        perf: Math.round(json.categories.performance.score * 100),
        a11y: Math.round(json.categories.accessibility.score * 100),
        best: Math.round(json.categories['best-practices'].score * 100),
        seo: Math.round(json.categories.seo.score * 100),
      }
      sections.push(`### ${url}\n- Performance: ${scores.perf}\n- Accessibility: ${scores.a11y}\n- Best practices: ${scores.best}\n- SEO: ${scores.seo}\n`)
    } catch (e) {
      sections.push(`### ${url}\nLighthouse error: ${e.message}\n`)
    }
  }

  return sections.join('\n')
}

export function writeQuarterlyAudit({ today = new Date().toISOString().slice(0, 10), runCommand = execSync } = {}) {
  const outDir = resolve('docs/superpowers/audits')
  const outPath = resolve(outDir, `${today}-auto-audit.md`)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(outPath, buildQuarterlyAuditMarkdown({ today, runCommand }), 'utf8')
  return outPath
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outPath = writeQuarterlyAudit()
  console.log(`Wrote ${outPath}`)
}
