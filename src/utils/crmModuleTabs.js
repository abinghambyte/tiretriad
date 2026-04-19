/**
 * Tab config for Rubber CRM (Board / Leads / DJ Dispatch). All tabs live on
 * `/crm` with a `?tab=` selector so state and back-nav behave consistently.
 *
 * @param {object} opts
 * @param {{ role?: string } | null | undefined} opts.profile
 * @param {string} opts.pathname
 * @param {URLSearchParams} opts.searchParams
 * @returns {Array<{ key: string, label: string, to: string, active: boolean }>}
 */
export function buildCrmTabs({ profile, pathname, searchParams }) {
  const rawTab = searchParams.get('tab')
  const tab = rawTab === 'leads' || rawTab === 'dispatch' ? rawTab : 'board'
  const canDispatch = profile?.role === 'mechanic' || profile?.role === 'admin'
  const onCrm = pathname === '/crm'
  const tabs = [
    {
      key: 'board',
      label: 'Board',
      to: '/crm',
      active: onCrm && tab === 'board',
    },
    {
      key: 'leads',
      label: 'Leads',
      to: '/crm?tab=leads',
      active: onCrm && tab === 'leads',
    },
  ]
  if (canDispatch) {
    tabs.push({
      key: 'dispatch',
      label: 'DJ Dispatch',
      to: '/crm?tab=dispatch',
      active: onCrm && tab === 'dispatch',
    })
  }
  return tabs
}
