import { describe, expect, it } from 'vitest'
import { BRAND } from './brand.js'

describe('BRAND config', () => {
  it('exposes portal + legal entity names', () => {
    expect(BRAND.portal).toBe('Tire Triad')
    expect(BRAND.legalEntity).toBe('Front Range Rubber LLC')
  })

  it('exposes the canonical domains', () => {
    expect(BRAND.apex).toBe('tiretriad.com')
    expect(BRAND.portalDomain).toBe('app.tiretriad.com')
    expect(BRAND.emailDomain).toBe('info.tiretriad.com')
    expect(BRAND.supportEmail).toBe('info@tiretriad.com')
  })

  it('builds the invite URL base', () => {
    expect(BRAND.inviteUrlBase).toBe('https://app.tiretriad.com/i')
  })

  it('preserves the legacy apex for the redirect window', () => {
    expect(BRAND.legacyApex).toBe('skedaddleinc.com')
  })
})
