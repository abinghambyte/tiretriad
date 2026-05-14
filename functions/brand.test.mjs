import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { BRAND } = require('./brand.js')

describe('BRAND config (server)', () => {
  it('mirrors client constants', () => {
    expect(BRAND.portal).toBe('Tire Triad')
    expect(BRAND.legalEntity).toBe('Front Range Rubber LLC')
    expect(BRAND.apex).toBe('tiretriad.com')
    expect(BRAND.portalDomain).toBe('app.tiretriad.com')
    expect(BRAND.emailDomain).toBe('info.tiretriad.com')
    expect(BRAND.supportEmail).toBe('info@tiretriad.com')
    expect(BRAND.inviteUrlBase).toBe('https://app.tiretriad.com/i')
    expect(BRAND.legacyApex).toBe('skedaddleinc.com')
  })
})
