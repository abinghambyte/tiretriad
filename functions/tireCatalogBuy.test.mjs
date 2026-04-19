import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { tireCatalogBuyNumber } = require('./tireCatalogBuy')

describe('tireCatalogBuyNumber (functions)', () => {
  it('prefers priceIntel.activeBuyPrice', () => {
    expect(tireCatalogBuyNumber({ price: 800, priceIntel: { activeBuyPrice: 675 } })).toBe(675)
  })

  it('falls back to price when activeBuyPrice missing or zero', () => {
    expect(tireCatalogBuyNumber({ price: 800 })).toBe(800)
    expect(tireCatalogBuyNumber({ price: 800, priceIntel: {} })).toBe(800)
    expect(tireCatalogBuyNumber({ price: 800, priceIntel: { activeBuyPrice: 0 } })).toBe(800)
  })

  it('falls back to cost when price missing', () => {
    expect(tireCatalogBuyNumber({ cost: 600 })).toBe(600)
  })

  it('returns 0 when no source populated, retailPrice is not a fallback', () => {
    expect(tireCatalogBuyNumber({})).toBe(0)
    expect(tireCatalogBuyNumber({ retailPrice: 900 })).toBe(0)
  })

  it('handles null / undefined', () => {
    expect(tireCatalogBuyNumber(null)).toBe(0)
    expect(tireCatalogBuyNumber(undefined)).toBe(0)
  })

  it('ignores negative and non-finite values', () => {
    expect(tireCatalogBuyNumber({ price: -10, cost: 500 })).toBe(500)
    expect(tireCatalogBuyNumber({ price: 'xyz', cost: 500 })).toBe(500)
  })
})
