import AxeBuilder from '@axe-core/playwright'
import { test, expect, gotoAndSettle } from './setup'
import disabled from './axe-disabled-rules.json' with { type: 'json' }

const ROUTES = [
  { path: '/', name: 'dashboard' },
  { path: '/tires', name: 'tires' },
  { path: '/orders', name: 'orders' },
  { path: '/people?tab=crew', name: 'people-crew' },
  { path: '/crm', name: 'crm' },
] as const

for (const route of ROUTES) {
  test(`${route.name} has no serious or critical a11y violations`, async ({ adminPage }) => {
    await gotoAndSettle(adminPage, route.path)
    const builder = new AxeBuilder({ page: adminPage }).withTags(['wcag2a', 'wcag2aa'])
    if (disabled.rules.length) builder.disableRules(disabled.rules)
    const results = await builder.analyze()
    const blockers = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    )
    // Surface the violations in the failure message so triage is easy
    expect.soft(blockers, JSON.stringify(blockers, null, 2)).toEqual([])
    expect(blockers).toEqual([])
  })
}
