import { test, expect } from './setup'

const ROUTES = [
  { path: '/', name: 'dashboard' },
  { path: '/tires', name: 'tires' },
  { path: '/orders', name: 'orders' },
  { path: '/people?tab=crew', name: 'people-crew' },
  { path: '/crm', name: 'crm' },
] as const

for (const route of ROUTES) {
  test(`${route.name} matches snapshot`, async ({ adminPage }) => {
    // Firestore listeners hold long-lived sockets and retry on permission
    // errors, which produces non-deterministic loading-state UI. Fast-fail
    // every Firestore network call so each query lands on its error state
    // immediately and the rendered output stabilizes.
    await adminPage.route(/firestore\.googleapis\.com|firebaseio\.com|googleapis\.com\/.*firestore/, (r) => r.abort())
    await adminPage.goto(route.path)
    // `networkidle` is unreliable — Vite HMR holds an open WebSocket. `load`
    // plus a short settle covers the synchronous render after data rejects.
    await adminPage.waitForLoadState('load')
    await adminPage.waitForTimeout(8000)
    // Pause any in-flight animations (the activity ticker etc.)
    await adminPage.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' })
    await expect(adminPage).toHaveScreenshot(`${route.name}.png`, { fullPage: true })
  })
}
