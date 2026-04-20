import { permissionMeets } from '../../constants/peoplePermissions'

/**
 * Normalize a label / keyword set for substring matching against a palette
 * query. Decomposes accents (NFD) and strips the combining marks, then
 * lowercases, so "análytics" and "Analytics" both match "analytics".
 *
 * @param {string} s
 * @returns {string}
 */
function norm(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/**
 * Build the palette action registry for the current session. Actions are
 * ordered by section so the palette can group them under headers without
 * re-sorting.
 *
 * Action shape:
 *   {
 *     id: string - stable key for React / selection tracking
 *     section: 'Navigation' | 'Actions'
 *     label: string - what the user sees
 *     hint?: string - right-aligned supporting text
 *     keywords?: string[] - extra terms that should match a query
 *     run: () => void - what to do when selected
 *   }
 *
 * Actions are filtered here by permission; the palette does not re-check.
 *
 * @param {object} ctx
 * @param {string} ctx.pathname - current route; nav actions for the current
 *   page are dropped so the palette does not offer redundant navigation.
 * @param {string} [ctx.search] - current location.search (including the
 *   leading `?`). Used for tab-aware suppression of nav entries; passed
 *   explicitly so the registry stays reactive to in-route tab changes
 *   rather than reading stale values from `window.location`.
 * @param {Record<string, unknown> | null | undefined} ctx.profile
 * @param {(module: string) => string} ctx.permissionFor
 * @param {'dark' | 'light'} ctx.theme
 * @param {(next?: 'dark' | 'light') => void} ctx.onToggleTheme
 * @param {() => Promise<void> | void} ctx.onSignOut
 * @param {(path: string) => void} ctx.navigate
 * @param {() => void} ctx.closePalette
 * @returns {Array<{ id: string, section: string, label: string, hint?: string, keywords?: string[], run: () => void }>}
 */
export function buildPaletteActions(ctx) {
  const {
    pathname,
    search = '',
    profile,
    permissionFor,
    theme,
    onToggleTheme,
    onSignOut,
    navigate,
    closePalette,
  } = ctx
  const role = String(profile?.role || '')
  const isAdmin = role === 'admin'

  // Dedicated `go` helper keeps every nav action's run-body consistent:
  // close the palette first, then navigate. Navigating first can race the
  // close because React Router's navigation is synchronous and the palette
  // unmount would fire during the new route's render tree.
  function go(path) {
    return () => {
      closePalette()
      navigate(path)
    }
  }

  /** @type {Array<{ id: string, section: string, label: string, hint?: string, keywords?: string[], run: () => void, show?: boolean }>} */
  const nav = [
    { id: 'nav-dashboard', label: 'Go to Dashboard', hint: '/dashboard', keywords: ['home'], path: '/dashboard', show: true },
    { id: 'nav-tires', label: 'Go to Tires', hint: '/tires', keywords: ['catalog', 'inventory'], path: '/tires', show: permissionMeets(permissionFor('tires'), 'view') },
    { id: 'nav-tires-orders', label: 'Go to Tires orders', hint: '/tires?tab=orders', keywords: ['orders', 'workflow'], path: '/tires?tab=orders', show: permissionMeets(permissionFor('orders'), 'view') },
    { id: 'nav-crm', label: 'Go to Rubber CRM', hint: '/crm', keywords: ['pipeline', 'leads', 'vip'], path: '/crm', show: permissionMeets(permissionFor('crm'), 'view') },
    { id: 'nav-crm-leads', label: 'Go to CRM leads', hint: '/crm?tab=leads', keywords: ['leads', 'prospects'], path: '/crm?tab=leads', show: permissionMeets(permissionFor('crm'), 'view') },
    { id: 'nav-crm-dispatch', label: 'Go to Field Dispatch', hint: '/crm?tab=dispatch', keywords: ['field', 'jobs', 'mechanic'], path: '/crm?tab=dispatch', show: role === 'mechanic' || isAdmin },
    { id: 'nav-people', label: 'Go to People', hint: '/people', keywords: ['crew', 'users', 'contacts'], path: '/people', show: permissionMeets(permissionFor('people'), 'manage') },
    { id: 'nav-people-customers', label: 'Go to People customers', hint: '/people?tab=customers', keywords: ['contacts'], path: '/people?tab=customers', show: permissionMeets(permissionFor('people'), 'manage') },
    { id: 'nav-analytics', label: 'Go to Analytics', hint: '/analytics', keywords: ['wall', 'metrics', 'revenue', 'reports'], path: '/analytics', show: permissionMeets(permissionFor('analytics'), 'view') },
    { id: 'nav-analytics-metrics', label: 'Go to Analytics metrics', hint: '/analytics?tab=metrics', keywords: ['kpis'], path: '/analytics?tab=metrics', show: permissionMeets(permissionFor('analytics'), 'view') },
    { id: 'nav-analytics-revenue', label: 'Go to Analytics revenue', hint: '/analytics?tab=revenue', keywords: ['money', 'mtd', 'wtd'], path: '/analytics?tab=revenue', show: permissionMeets(permissionFor('analytics'), 'view') },
    { id: 'nav-analytics-leaderboard', label: 'Go to Analytics leaderboard', hint: '/analytics?tab=leaderboard', keywords: ['rank'], path: '/analytics?tab=leaderboard', show: permissionMeets(permissionFor('analytics'), 'view') },
    { id: 'nav-ops', label: 'Go to Ops Command', hint: '/ops', keywords: ['expenses', 'credit', 'reorder'], path: '/ops', show: isAdmin },
    { id: 'nav-admin', label: 'Go to Admin', hint: '/admin', keywords: ['settings'], path: '/admin', show: isAdmin },
    { id: 'nav-growth', label: 'Go to Growth Lab', hint: '/growth', keywords: ['experiments', 'tools'], path: '/growth', show: isAdmin },
  ]

  /** Running actions don't get path-suppression; they can fire on any page. */
  const generic = [
    {
      id: 'action-toggle-theme',
      section: 'Actions',
      label: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
      hint: 'Theme',
      keywords: ['dark', 'light', 'theme', 'mode'],
      run: () => {
        onToggleTheme()
        closePalette()
      },
    },
    {
      id: 'action-sign-out',
      section: 'Actions',
      label: 'Sign out',
      hint: 'End session',
      keywords: ['logout', 'log out', 'signout', 'quit'],
      run: () => {
        closePalette()
        void onSignOut()
      },
    },
  ]

  // Drop nav entries whose target matches the current pathname (with the
  // same query tab) so users don't see redundant "Go to Dashboard" while on
  // Dashboard. Keep non-tab paths even when already open so the user can
  // quickly cycle back to the default view.
  // `search` comes through the context (fed from `useLocation().search` in
  // the palette) so the registry stays reactive to tab changes and the
  // module can be unit-tested without a `window` shim.
  const pathMatches = (target) => {
    if (!target) return false
    const [tPath, tQuery] = target.split('?')
    if (pathname !== tPath) return false
    const cur = new URLSearchParams(search || '')
    // A tab-less target like `/tires` should only suppress itself when the
    // user is on the default tab (no `tab` query). If they're on
    // `/tires?tab=orders`, keep `Go to Tires` visible so the palette can
    // bounce them back to the default view.
    if (!tQuery) return !cur.has('tab')
    const tgt = new URLSearchParams(tQuery)
    for (const [k, v] of tgt) {
      if (cur.get(k) !== v) return false
    }
    return true
  }

  const navEntries = nav
    .filter((a) => a.show && !pathMatches(a.path))
    .map((a) => ({
      id: a.id,
      section: 'Navigation',
      label: a.label,
      hint: a.hint,
      keywords: a.keywords || [],
      run: go(a.path),
    }))

  return [...navEntries, ...generic]
}

/**
 * Filter an action list by a user query. Matches against the label and the
 * keyword array case-insensitively. An empty query returns every action.
 *
 * @param {ReturnType<typeof buildPaletteActions>} actions
 * @param {string} query
 */
export function filterPaletteActions(actions, query) {
  const q = norm(query).trim()
  if (!q) return actions
  return actions.filter((a) => {
    if (norm(a.label).includes(q)) return true
    if (a.keywords && a.keywords.some((k) => norm(k).includes(q))) return true
    if (a.hint && norm(a.hint).includes(q)) return true
    return false
  })
}
