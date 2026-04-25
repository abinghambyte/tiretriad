// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  isTestBypassEnabled,
  getTestBypassRole,
  makeBypassUser,
  makeBypassProfile,
} from './testBypass.js'

describe('testBypass', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(() => {
    window.localStorage.clear()
  })

  it('returns false when localStorage flag is missing', () => {
    expect(isTestBypassEnabled()).toBe(false)
  })

  it('returns true when DEV is true and the flag is set to "1"', () => {
    // import.meta.env.DEV is true in vitest by default
    window.localStorage.setItem('skedaddle.test.bypassAuth', '1')
    expect(isTestBypassEnabled()).toBe(true)
  })

  it('returns false when the flag is set to anything other than "1"', () => {
    window.localStorage.setItem('skedaddle.test.bypassAuth', 'true')
    expect(isTestBypassEnabled()).toBe(false)
  })

  it('falls back to admin when no role is set', () => {
    expect(getTestBypassRole()).toBe('admin')
  })

  it('returns the role that was set', () => {
    window.localStorage.setItem('skedaddle.test.role', 'sourcer')
    expect(getTestBypassRole()).toBe('sourcer')
  })

  it('makeBypassUser returns the expected shape', () => {
    const u = makeBypassUser()
    expect(u.uid).toBe('test-bypass-admin')
    expect(u.email).toContain('@skedaddle.local')
    expect(typeof u.getIdToken).toBe('function')
  })

  it('makeBypassProfile defaults to admin role with manage permissions', () => {
    const p = makeBypassProfile()
    expect(p.role).toBe('admin')
    expect(p.permissions.tires).toBe('manage')
  })

  it('makeBypassProfile accepts a role override', () => {
    const p = makeBypassProfile('sourcer')
    expect(p.role).toBe('sourcer')
  })
})
