/**
 * DEV-only auth bypass. Returns a fake admin user/profile when:
 *   1. Vite build is in dev mode (import.meta.env.DEV === true), AND
 *   2. localStorage.getItem('skedaddle.test.bypassAuth') === '1'
 *
 * In production builds, Vite replaces `import.meta.env.DEV` with literal
 * `false`, so the entire branch dead-code-eliminates and the production
 * bundle contains zero references to the localStorage keys. Verify with
 * `npm run build && grep -r "skedaddle.test" dist/` -- must return nothing.
 *
 * Used by useAuth and the UserProfileProvider to skip Firebase auth
 * entirely during E2E tests.
 */

export function isTestBypassEnabled() {
  if (!import.meta.env.DEV) return false
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem('skedaddle.test.bypassAuth') === '1'
  } catch {
    return false
  }
}

export function getTestBypassRole() {
  if (typeof window === 'undefined') return 'admin'
  try {
    return window.localStorage.getItem('skedaddle.test.role') || 'admin'
  } catch {
    return 'admin'
  }
}

/** A fake Firebase User object with the minimum shape consumers need. */
export function makeBypassUser() {
  return {
    uid: 'test-bypass-admin',
    email: 'test-bypass@skedaddle.local',
    displayName: 'Test Admin',
    emailVerified: true,
    isAnonymous: false,
    providerData: [],
    // Methods consumers might call -- return safe no-ops
    getIdToken: async () => 'test-bypass-token',
    getIdTokenResult: async () => ({ token: 'test-bypass-token', claims: {} }),
    reload: async () => undefined,
  }
}

/** A fake user profile with admin role + permissions. */
export function makeBypassProfile(role) {
  return {
    id: 'test-bypass-admin',
    uid: 'test-bypass-admin',
    firstName: 'Test',
    lastName: 'Admin',
    email: 'test-bypass@skedaddle.local',
    role: role || 'admin',
    crewTag: 'OVERWATCH',
    handshakeSeen: true,
    inviteAccepted: true,
    inviteStatus: 'active',
    permissions: {
      tires: 'manage',
      orders: 'manage',
      people: 'manage',
      analytics: 'manage',
      crm: 'manage',
      ops: 'manage',
    },
  }
}
