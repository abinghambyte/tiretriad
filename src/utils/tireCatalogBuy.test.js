import { describe, expect, it } from 'vitest'
import { tireCatalogBuyNumber } from './tireCatalogBuy'

describe('tireCatalogBuyNumber', () => {
  it('prefers priceIntel.activeBuyPrice when > 0', () => {
    const tire = {
      price: 800,
      cost: 700,
      priceIntel: { activeBuyPrice: 675 },
    }
    expect(tireCatalogBuyNumber(tire)).toBe(675)
  })

  it('falls back to top-level price when activeBuyPrice missing or zero', () => {
    expect(tireCatalogBuyNumber({ price: 800 })).toBe(800)
    expect(tireCatalogBuyNumber({ price: 800, priceIntel: { activeBuyPrice: 0 } })).toBe(800)
  })

  it('falls back to cost when price missing', () => {
    expect(tireCatalogBuyNumber({ cost: 600 })).toBe(600)
  })

  it('returns 0 when nothing is populated (no retailPrice fallback any more)', () => {
    expect(tireCatalogBuyNumber({})).toBe(0)
    // retailPrice field is NOT consulted, per AGENTS.md convention
    expect(tireCatalogBuyNumber({ retailPrice: 999 })).toBe(0)
  })

  it('handles null / undefined input', () => {
    expect(tireCatalogBuyNumber(null)).toBe(0)
    expect(tireCatalogBuyNumber(undefined)).toBe(0)
  })

  it('ignores negative and non-finite values', () => {
    expect(tireCatalogBuyNumber({ price: -5, cost: 600 })).toBe(600)
    expect(tireCatalogBuyNumber({ price: 'abc', cost: 600 })).toBe(600)
    expect(tireCatalogBuyNumber({ price: NaN, cost: 600 })).toBe(600)
  })

  it('coerces string numerics', () => {
    expect(tireCatalogBuyNumber({ price: '800' })).toBe(800)
  })

  it('ignores kyleConfirmed when activeBuyPrice is set', () => {
    // Per AGENTS.md: priceIntel.kyleConfirmed freezes activeBuyPrice but the
    // lookup uses the value regardless of the flag state.
    const tire = { price: 800, priceIntel: { activeBuyPrice: 700, kyleConfirmed: true } }
    expect(tireCatalogBuyNumber(tire)).toBe(700)
  })
})
