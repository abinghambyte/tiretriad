import { describe, expect, it, vi } from 'vitest'
import { buildPaletteActions, filterPaletteActions } from './paletteActions.js'

function makeCtx(overrides = {}) {
  return {
    pathname: '/dashboard',
    search: '',
    profile: { role: 'admin' },
    permissionFor: () => 'manage',
    theme: 'dark',
    onToggleTheme: vi.fn(),
    onSignOut: vi.fn(),
    navigate: vi.fn(),
    closePalette: vi.fn(),
    ...overrides,
  }
}

describe('buildPaletteActions', () => {
  it('includes every nav entry plus the generic actions for an admin', () => {
    const actions = buildPaletteActions(makeCtx())
    // The nav includes Dashboard but that's the current path so it should be suppressed.
    expect(actions.find((a) => a.id === 'nav-dashboard')).toBeUndefined()
    expect(actions.find((a) => a.id === 'nav-tires')).toBeDefined()
    expect(actions.find((a) => a.id === 'nav-admin')).toBeDefined()
    expect(actions.find((a) => a.id === 'nav-ops')).toBeDefined()
    expect(actions.find((a) => a.id === 'action-toggle-theme')).toBeDefined()
    expect(actions.find((a) => a.id === 'action-sign-out')).toBeDefined()
  })

  it('hides admin-only nav from non-admin roles', () => {
    const actions = buildPaletteActions(
      makeCtx({ profile: { role: 'viewer' }, permissionFor: () => 'view' }),
    )
    expect(actions.find((a) => a.id === 'nav-admin')).toBeUndefined()
    expect(actions.find((a) => a.id === 'nav-ops')).toBeUndefined()
    expect(actions.find((a) => a.id === 'nav-growth')).toBeUndefined()
    // View-level permissions still get tires + analytics.
    expect(actions.find((a) => a.id === 'nav-tires')).toBeDefined()
    expect(actions.find((a) => a.id === 'nav-analytics')).toBeDefined()
  })

  it('hides entries gated by permissionMeets when level is none', () => {
    const actions = buildPaletteActions(
      makeCtx({ profile: { role: 'mechanic' }, permissionFor: () => 'none' }),
    )
    // No permission => no tires / analytics / people.
    expect(actions.find((a) => a.id === 'nav-tires')).toBeUndefined()
    expect(actions.find((a) => a.id === 'nav-analytics')).toBeUndefined()
    expect(actions.find((a) => a.id === 'nav-people')).toBeUndefined()
    // Generic actions always appear.
    expect(actions.find((a) => a.id === 'action-sign-out')).toBeDefined()
  })

  it('suppresses the current-route nav entry when pathname + tab both match', () => {
    // On /dashboard with no tab param, the bare "Go to Dashboard" entry is
    // dropped since it would be a no-op navigation.
    const dashOnDash = buildPaletteActions(makeCtx({ pathname: '/dashboard' }))
    expect(dashOnDash.find((a) => a.id === 'nav-dashboard')).toBeUndefined()

    // On /tires with no tab query, the bare "Go to Tires" is dropped but
    // tab-specific variants ("Go to Tires orders") remain.
    const onTires = buildPaletteActions(makeCtx({ pathname: '/tires' }))
    expect(onTires.find((a) => a.id === 'nav-tires')).toBeUndefined()
    expect(onTires.find((a) => a.id === 'nav-tires-orders')).toBeDefined()
  })

  it('keeps the bare nav entry visible when user is on a sub-tab so they can cycle back', () => {
    // On /tires?tab=orders, "Go to Tires orders" is the no-op and should go
    // away. "Go to Tires" (the default view) should stay so the palette can
    // bounce the user back.
    const onTiresOrders = buildPaletteActions(
      makeCtx({ pathname: '/tires', search: '?tab=orders' }),
    )
    expect(onTiresOrders.find((a) => a.id === 'nav-tires-orders')).toBeUndefined()
    expect(onTiresOrders.find((a) => a.id === 'nav-tires')).toBeDefined()
  })

  it('matches the exact tab value when multiple sub-tabs exist on the same pathname', () => {
    // User on /analytics?tab=revenue: only the revenue variant should be
    // hidden; the other analytics-tab entries (metrics, leaderboard) still
    // show, and the bare /analytics entry also stays since the user is not
    // on the default tab.
    const onRevenue = buildPaletteActions(
      makeCtx({ pathname: '/analytics', search: '?tab=revenue' }),
    )
    expect(onRevenue.find((a) => a.id === 'nav-analytics-revenue')).toBeUndefined()
    expect(onRevenue.find((a) => a.id === 'nav-analytics-metrics')).toBeDefined()
    expect(onRevenue.find((a) => a.id === 'nav-analytics-leaderboard')).toBeDefined()
    expect(onRevenue.find((a) => a.id === 'nav-analytics')).toBeDefined()
  })

  it('nav run handlers close the palette then navigate', () => {
    const closePalette = vi.fn()
    const navigate = vi.fn()
    const actions = buildPaletteActions(
      makeCtx({ closePalette, navigate, pathname: '/dashboard' }),
    )
    const tires = actions.find((a) => a.id === 'nav-tires')
    tires.run()
    expect(closePalette).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith('/tires')
    expect(closePalette).toHaveBeenCalledBefore(navigate)
  })

  it('toggle theme action calls the toggle callback and closes', () => {
    const onToggleTheme = vi.fn()
    const closePalette = vi.fn()
    const actions = buildPaletteActions(makeCtx({ onToggleTheme, closePalette }))
    const toggle = actions.find((a) => a.id === 'action-toggle-theme')
    expect(toggle.label).toMatch(/light/i) // dark mode shows "Switch to light mode"
    toggle.run()
    expect(onToggleTheme).toHaveBeenCalled()
    expect(closePalette).toHaveBeenCalled()
  })

  it('sign-out action closes before calling onSignOut (so the unmount race stays stable)', () => {
    const order = []
    const closePalette = vi.fn(() => order.push('close'))
    const onSignOut = vi.fn(() => order.push('signOut'))
    const actions = buildPaletteActions(makeCtx({ closePalette, onSignOut }))
    const signOut = actions.find((a) => a.id === 'action-sign-out')
    signOut.run()
    expect(order).toEqual(['close', 'signOut'])
  })
})

describe('buildPaletteActions — tire selection entries', () => {
  function sel(overrides = {}) {
    return {
      count: 2,
      canLogSale: true,
      canQuote: false,
      canGenerateListings: true,
      canBulkOverhead: true,
      runLogSale: vi.fn(),
      runQuote: vi.fn(),
      runGenerateListings: vi.fn(),
      runBulkOverhead: vi.fn(),
      runClearSelection: vi.fn(),
      ...overrides,
    }
  }

  it('adds no selection section when no tires are selected', () => {
    const actions = buildPaletteActions(makeCtx({ tireSelection: null }))
    expect(actions.some((a) => a.section === 'Selection')).toBe(false)
    const empty = buildPaletteActions(makeCtx({ tireSelection: { count: 0 } }))
    expect(empty.some((a) => a.section === 'Selection')).toBe(false)
  })

  it('includes log-sale / generate-listings / bulk-overhead / clear when count ≥ 1 (but not quote at count=2)', () => {
    const actions = buildPaletteActions(makeCtx({ tireSelection: sel() }))
    expect(actions.find((a) => a.id === 'selection-log-sale')).toBeDefined()
    expect(actions.find((a) => a.id === 'selection-generate-listings')).toBeDefined()
    expect(actions.find((a) => a.id === 'selection-bulk-overhead')).toBeDefined()
    expect(actions.find((a) => a.id === 'selection-clear')).toBeDefined()
    expect(actions.find((a) => a.id === 'selection-quote')).toBeUndefined()
  })

  it('offers the Quote action only when canQuote is true (exactly one tire)', () => {
    const actions = buildPaletteActions(
      makeCtx({ tireSelection: sel({ count: 1, canQuote: true }) }),
    )
    const quote = actions.find((a) => a.id === 'selection-quote')
    expect(quote).toBeDefined()
    expect(quote.label).toMatch(/quote/i)
  })

  it('selection actions appear before nav and generic actions so the mid-workflow hit is first', () => {
    const actions = buildPaletteActions(makeCtx({ tireSelection: sel() }))
    const firstSelection = actions.findIndex((a) => a.section === 'Selection')
    const firstNav = actions.findIndex((a) => a.section === 'Navigation')
    const firstGeneric = actions.findIndex((a) => a.section === 'Actions')
    expect(firstSelection).toBe(0)
    expect(firstSelection).toBeLessThan(firstNav)
    expect(firstNav).toBeLessThan(firstGeneric)
  })

  it('selection-entry labels include the tire count with correct pluralization', () => {
    const one = buildPaletteActions(
      makeCtx({ tireSelection: sel({ count: 1, canQuote: true }) }),
    )
    expect(one.find((a) => a.id === 'selection-log-sale').label).toMatch(/1 tire selected/)
    const many = buildPaletteActions(makeCtx({ tireSelection: sel({ count: 5 }) }))
    expect(many.find((a) => a.id === 'selection-log-sale').label).toMatch(/5 tires selected/)
  })

  it('running a selection action closes the palette first, then invokes the runner', () => {
    const order = []
    const closePalette = vi.fn(() => order.push('close'))
    const runLogSale = vi.fn(() => order.push('logSale'))
    const actions = buildPaletteActions(
      makeCtx({ closePalette, tireSelection: sel({ runLogSale }) }),
    )
    const log = actions.find((a) => a.id === 'selection-log-sale')
    log.run()
    expect(order).toEqual(['close', 'logSale'])
  })

  it('hides an action when the matching can* flag is false even if the runner is present', () => {
    const actions = buildPaletteActions(
      makeCtx({ tireSelection: sel({ canLogSale: false, canBulkOverhead: false }) }),
    )
    expect(actions.find((a) => a.id === 'selection-log-sale')).toBeUndefined()
    expect(actions.find((a) => a.id === 'selection-bulk-overhead')).toBeUndefined()
    // Clear stays available regardless of the can* flags because it's a
    // pure selection-reset with no backend work.
    expect(actions.find((a) => a.id === 'selection-clear')).toBeDefined()
  })

  it('hides an action when the runner is missing even if the flag is true (defensive against partial snapshots)', () => {
    const actions = buildPaletteActions(
      makeCtx({
        tireSelection: { count: 3, canLogSale: true, canGenerateListings: true },
      }),
    )
    expect(actions.find((a) => a.id === 'selection-log-sale')).toBeUndefined()
    expect(actions.find((a) => a.id === 'selection-generate-listings')).toBeUndefined()
  })
})

describe('filterPaletteActions', () => {
  const actions = buildPaletteActions(makeCtx({ pathname: '/' }))

  it('returns every action for an empty query', () => {
    expect(filterPaletteActions(actions, '')).toHaveLength(actions.length)
    expect(filterPaletteActions(actions, '   ')).toHaveLength(actions.length)
  })

  it('matches by label substring', () => {
    const hits = filterPaletteActions(actions, 'analytics')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every((a) => a.id.startsWith('nav-analytics'))).toBe(true)
  })

  it('matches by keyword', () => {
    // 'logout' is a keyword on the sign-out action.
    const hits = filterPaletteActions(actions, 'logout')
    expect(hits.find((a) => a.id === 'action-sign-out')).toBeDefined()
  })

  it('matches by hint (the right-side supporting text)', () => {
    // '/ops' is the hint on the Ops nav entry.
    const hits = filterPaletteActions(actions, '/ops')
    expect(hits.find((a) => a.id === 'nav-ops')).toBeDefined()
  })

  it('is case-insensitive', () => {
    expect(filterPaletteActions(actions, 'DASHBOARD').length).toBe(
      filterPaletteActions(actions, 'dashboard').length,
    )
  })

  it('is diacritic-insensitive so accented queries still hit plain labels', () => {
    // A user typing "análytics" should still find the Analytics nav entry.
    const hits = filterPaletteActions(actions, 'análytics')
    expect(hits.find((a) => a.id === 'nav-analytics')).toBeDefined()
  })
})
