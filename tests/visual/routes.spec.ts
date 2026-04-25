import { test, expect, gotoAndSettle } from './setup'

const ROUTES = [
  { path: '/', name: 'dashboard' },
  { path: '/tires', name: 'tires' },
  { path: '/orders', name: 'orders' },
  { path: '/people?tab=crew', name: 'people-crew' },
  { path: '/crm', name: 'crm' },
] as const

for (const route of ROUTES) {
  test(`${route.name} matches snapshot`, async ({ adminPage }) => {
    await gotoAndSettle(adminPage, route.path)
    await expect(adminPage).toHaveScreenshot(`${route.name}.png`, { fullPage: true })
  })
}
