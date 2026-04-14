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
