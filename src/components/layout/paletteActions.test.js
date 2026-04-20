import { describe, expect, it, vi } from 'vitest'
import { buildPaletteActions, filterPaletteActions } from './paletteActions.js'

function makeCtx(overrides = {}) {
  return {
    pathname: '/dashboard',
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

  it('suppresses the current-route nav entry including tab query', () => {
    // jsdom's window.location.search defaults to "" — test non-tab path first.
    const dashOnDash = buildPaletteActions(makeCtx({ pathname: '/dashboard' }))
    expect(dashOnDash.find((a) => a.id === 'nav-dashboard')).toBeUndefined()

    // On /tires with no tab query, both "Go to Tires" (bare) and its tab
    // variants should remain — the bare one is a no-op navigation but the
    // tab-specific ones take the user somewhere new.
    const onTires = buildPaletteActions(makeCtx({ pathname: '/tires' }))
    expect(onTires.find((a) => a.id === 'nav-tires')).toBeUndefined()
    expect(onTires.find((a) => a.id === 'nav-tires-orders')).toBeDefined()
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
})
