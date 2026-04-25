import { describe, expect, it } from 'vitest'
import { buildQuarterlyAuditMarkdown } from './run-quarterly-audit.mjs'

const lighthouseJson = JSON.stringify({
  categories: {
    performance: { score: 0.91 },
    accessibility: { score: 0.98 },
    'best-practices': { score: 0.87 },
    seo: { score: 1 },
  },
})

describe('buildQuarterlyAuditMarkdown', () => {
  it('includes Playwright output and Lighthouse scores for production routes', () => {
    const commands = []
    const markdown = buildQuarterlyAuditMarkdown({
      today: '2026-04-25',
      runCommand: (command) => {
        commands.push(command)
        if (command === 'npm run test:visual') {
          return 'visual test output'
        }
        return lighthouseJson
      },
    })

    expect(markdown).toContain('# Quarterly auto-audit - 2026-04-25')
    expect(markdown).toContain('## Playwright visual + a11y')
    expect(markdown).toContain('visual test output')
    expect(markdown).toContain('### https://skedaddleinc.com/')
    expect(markdown).toContain('- Performance: 91')
    expect(markdown).toContain('- Accessibility: 98')
    expect(markdown).toContain('- Best practices: 87')
    expect(markdown).toContain('- SEO: 100')
    expect(commands).toHaveLength(4)
  })

  it('records a Lighthouse error for a route without aborting the audit', () => {
    const markdown = buildQuarterlyAuditMarkdown({
      today: '2026-04-25',
      runCommand: (command) => {
        if (command.includes('https://skedaddleinc.com/tires')) {
          throw new Error('network blocked')
        }
        if (command === 'npm run test:visual') {
          return 'visual test output'
        }
        return lighthouseJson
      },
    })

    expect(markdown).toContain('### https://skedaddleinc.com/tires')
    expect(markdown).toContain('Lighthouse error: network blocked')
    expect(markdown).toContain('### https://skedaddleinc.com/orders')
  })
})
