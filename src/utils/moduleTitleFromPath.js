/**
 * @param {string} pathname
 * @returns {string}
 */
export function moduleTitleFromPath(pathname) {
  const p = String(pathname || '')
  if (p === '/dashboard' || p === '/handshake') return 'Dashboard'
  if (p.startsWith('/tires')) return 'Skedaddle Tires'
  if (p.startsWith('/crm/dispatch')) return 'DJ Dispatch'
  if (p.startsWith('/crm')) return 'Rubber CRM'
  if (p.startsWith('/people')) return 'People Systems'
  if (p.startsWith('/analytics')) return 'Analytics'
  if (p.startsWith('/ops')) return 'Ops Command'
  if (p.startsWith('/orders')) return 'Orders'
  if (p.startsWith('/intake')) return 'Mechanic intake'
  if (p.startsWith('/i/')) return 'Invite'
  return 'Skedaddle'
}

/**
 * @param {string} pathname
 * @returns {boolean}
 */
export function showDashboardBackLink(pathname) {
  const p = String(pathname || '')
  if (p === '/' || p === '/dashboard') return false
  if (p.startsWith('/i/')) return false
  return true
}

/** Title-case a URL slug ("dj-dispatch" -> "Dj Dispatch"). */
function slugTitle(slug) {
  const s = String(slug || '').trim()
  if (!s) return ''
  return s
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
}

/** Tab-specific labels keyed by `pathname?tab=<tab>`. */
const TAB_LABELS = {
  '/crm?tab=board': 'Board',
  '/crm?tab=leads': 'Leads',
  '/crm?tab=dispatch': 'DJ Dispatch',
  '/tires?tab=orders': 'Orders',
  '/tires?tab=catalog': 'Catalog',
  '/people?tab=customers': 'Customers',
  '/analytics?tab=wall': 'The Wall',
}

/** Labels for first-segment module paths. */
const MODULE_LABELS = {
  '/dashboard': 'Dashboard',
  '/tires': 'Skedaddle Tires',
  '/crm': 'Rubber CRM',
  '/people': 'People Systems',
  '/analytics': 'Analytics',
  '/ops': 'Ops Command',
  '/orders': 'Orders',
  '/growth': 'Growth Lab',
}

/**
 * Build breadcrumb segments for the top bar. The first entry is always
 * Dashboard, then the current module (linked), then an optional tab (not
 * linked — it is the current view).
 *
 * @param {string} pathname
 * @param {string | null | undefined} tab value from `?tab=`
 * @returns {Array<{ label: string, to: string | null }>}
 */
export function buildBreadcrumbs(pathname, tab) {
  const p = String(pathname || '')
  if (!p || p === '/' || p === '/dashboard' || p === '/handshake' || p.startsWith('/i/')) {
    return []
  }
  const parts = p.split('/').filter(Boolean)
  if (parts.length === 0) return []
  const firstSeg = `/${parts[0]}`
  const moduleLabel = MODULE_LABELS[firstSeg] || slugTitle(parts[0])
  /** @type {Array<{ label: string, to: string | null }>} */
  const trail = [{ label: 'Dashboard', to: '/dashboard' }]

  const hasSub = parts.length > 1
  const tabKey = tab ? `${firstSeg}?tab=${tab}` : ''
  const tabLabel = tabKey ? TAB_LABELS[tabKey] : ''

  if (hasSub || tabLabel) {
    trail.push({ label: moduleLabel, to: firstSeg })
    if (hasSub) {
      // Sub-path: last path segment, title-cased (special case known mappings)
      const subKey = `${firstSeg}/${parts[1]}`
      const known = MODULE_LABELS[subKey]
      trail.push({ label: known || slugTitle(parts[1]), to: null })
    } else if (tabLabel) {
      trail.push({ label: tabLabel, to: null })
    }
  } else {
    trail.push({ label: moduleLabel, to: null })
  }
  return trail
}
