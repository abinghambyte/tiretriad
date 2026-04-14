/**
 * Short crew tag for the global top bar (four canonical labels only).
 *
 * @param {string | undefined} role
 * @returns {'Overwatch' | 'Source' | 'Field' | 'Spotter'}
 */
export function portalCrewTagFromRole(role) {
  const r = String(role || 'viewer')
  if (r === 'admin') return 'Overwatch'
  if (r === 'supplier') return 'Source'
  if (r === 'mechanic') return 'Field'
  return 'Spotter'
}
