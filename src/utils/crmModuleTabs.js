/**
 * Tab config for Rubber CRM (Board / Leads / DJ Dispatch) shared by CrmPage and CrmDispatchPage.
 *
 * @param {object} opts
 * @param {{ role?: string } | null | undefined} opts.profile
 * @param {string} opts.pathname
 * @param {URLSearchParams} opts.searchParams
 * @returns {Array<{ key: string, label: string, to: string, active: boolean }>}
 */
export function buildCrmTabs({ profile, pathname, searchParams }) {
  const tab = searchParams.get('tab') === 'leads' ? 'leads' : 'board'
  const canDispatch = profile?.role === 'mechanic' || profile?.role === 'admin'
  const tabs = [
    {
      key: 'board',
      label: 'Board',
      to: '/crm',
      active: pathname === '/crm' && tab === 'board',
    },
    {
      key: 'leads',
      label: 'Leads',
      to: '/crm?tab=leads',
      active: pathname === '/crm' && tab === 'leads',
    },
  ]
  if (canDispatch) {
    tabs.push({
      key: 'dispatch',
      label: 'DJ Dispatch',
      to: '/crm/dispatch',
      active: pathname.startsWith('/crm/dispatch'),
    })
  }
  return tabs
}
