/**
 * Phase 4 People System — defaults align with docs/PHASE4-PEOPLE-SYSTEM-HANDOFF.md
 */

export const ROLE_DEFAULTS = {
  admin: {
    tires: 'edit',
    orders: 'act',
    people: 'manage',
    crm: 'manage',
    analytics: 'view',
    revenue: 'view',
    wall: 'view',
  },
  supplier: {
    tires: 'view',
    orders: 'view',
    people: 'none',
    crm: 'none',
    analytics: 'view',
    revenue: 'none',
    wall: 'view',
  },
  mechanic: {
    tires: 'none',
    orders: 'act',
    people: 'none',
    crm: 'view',
    analytics: 'view',
    revenue: 'none',
    wall: 'view',
  },
  viewer: {
    tires: 'view',
    orders: 'view',
    people: 'none',
    crm: 'none',
    analytics: 'view',
    revenue: 'none',
    wall: 'view',
  },
}

const CREW_TAGS = {
  admin: 'Overwatch',
  supplier: 'Source',
  mechanic: 'Field',
  dispatch: 'Ground Control',
  sales: 'Scout',
  installer: 'Wrench',
  viewer: 'Spotter',
}

/** @param {string} role */
export function crewTagFromRole(role) {
  return CREW_TAGS[role] || 'Spotter'
}

/** none < view < edit|act < manage */
const RANK = {
  none: 0,
  view: 1,
  edit: 2,
  act: 2,
  manage: 3,
}

/**
 * @param {string | undefined} userLevel permission stored on user doc
 * @param {'none'|'view'|'edit'|'act'|'manage'} required
 */
export function permissionMeets(userLevel, required) {
  const u = RANK[userLevel] ?? 0
  const r = RANK[required] ?? 0
  return u >= r
}

/** Side panel matrix — valid levels per module (Phase 4 handoff grid). */
export const MODULE_MATRIX = [
  { key: 'tires', label: 'Tires', levels: ['none', 'view', 'edit'] },
  { key: 'orders', label: 'Orders', levels: ['none', 'view', 'act'] },
  { key: 'people', label: 'People', levels: ['none', 'view', 'manage'] },
  { key: 'crm', label: 'Rubber CRM', levels: ['none', 'view', 'edit', 'manage'] },
  { key: 'analytics', label: 'Analytics', levels: ['none', 'view'] },
  { key: 'revenue', label: 'Revenue', levels: ['none', 'view'] },
  { key: 'wall', label: 'Wall', levels: ['none', 'view'] },
]
