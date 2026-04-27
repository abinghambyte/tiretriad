import { describe, expect, it } from 'vitest'
import { brandColorToken, brandColorCssVar } from './brandColor.js'

describe('brandColorToken', () => {
  it('maps BFGOODRICH to brand-bfg', () => {
    expect(brandColorToken('BFGOODRICH')).toBe('brand-bfg')
  })

  it('maps BFG short form to brand-bfg', () => {
    expect(brandColorToken('BFG')).toBe('brand-bfg')
  })

  it('maps MICHELIN to brand-michelin', () => {
    expect(brandColorToken('MICHELIN')).toBe('brand-michelin')
  })

  it('maps UNIROYAL to brand-uniroyal', () => {
    expect(brandColorToken('UNIROYAL')).toBe('brand-uniroyal')
  })

  it('lowercase input still resolves', () => {
    expect(brandColorToken('michelin')).toBe('brand-michelin')
  })

  it('mixed case input still resolves', () => {
    expect(brandColorToken('BfGoodrich')).toBe('brand-bfg')
  })

  it('whitespace tolerated', () => {
    expect(brandColorToken('  Michelin  ')).toBe('brand-michelin')
  })

  it('unknown brand falls back to brand-default', () => {
    expect(brandColorToken('Goodyear')).toBe('brand-default')
  })

  it('null brand falls back to brand-default', () => {
    expect(brandColorToken(null)).toBe('brand-default')
  })

  it('undefined brand falls back to brand-default', () => {
    expect(brandColorToken(undefined)).toBe('brand-default')
  })

  it('empty string falls back to brand-default', () => {
    expect(brandColorToken('')).toBe('brand-default')
  })
})

describe('brandColorCssVar', () => {
  it('returns a var() reference for a known brand', () => {
    expect(brandColorCssVar('Michelin')).toBe('var(--color-brand-michelin)')
  })

  it('returns the default token when brand is unknown', () => {
    expect(brandColorCssVar('Goodyear')).toBe('var(--color-brand-default)')
  })

  it('handles null', () => {
    expect(brandColorCssVar(null)).toBe('var(--color-brand-default)')
  })
})
