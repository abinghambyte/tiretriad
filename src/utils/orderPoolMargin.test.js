import { describe, expect, it } from 'vitest'
import { poolDollarsForOrder, marginPercentOfPayment } from './orderPoolMargin'
import { kyleBuyBasisPerTire } from './orderCostBasis'

const baseTire = {
  price: 800, // Kyle buy
  mountCost: 10,
  deliveryCost: 20,
  otherCost: 5, // CTS total = 35
}

describe('kyleBuyBasisPerTire', () => {
  it('returns Kyle override when set on the order', () => {
    expect(kyleBuyBasisPerTire({ kylePriceOverride: 750 }, baseTire)).toBe(750)
  })

  it('falls back to catalog buy when no override', () => {
    expect(kyleBuyBasisPerTire({}, baseTire)).toBe(800)
  })

  it('treats non-finite override as missing', () => {
    expect(kyleBuyBasisPerTire({ kylePriceOverride: 'abc' }, baseTire)).toBe(800)
    expect(kyleBuyBasisPerTire({ kylePriceOverride: null }, baseTire)).toBe(800)
  })

  it('accepts zero override (intentionally free)', () => {
    expect(kyleBuyBasisPerTire({ kylePriceOverride: 0 }, baseTire)).toBe(0)
  })
})

describe('poolDollarsForOrder', () => {
  it('computes pool = payment - (buy + cts) * qty', () => {
    const order = { quantity: 1, paymentAmount: 950 }
    // cost = (800 + 35) * 1 = 835; pool = 950 - 835 = 115
    expect(poolDollarsForOrder(order, baseTire)).toBe(115)
  })

  it('scales cost by quantity', () => {
    const order = { quantity: 4, paymentAmount: 3800 }
    // cost = (800 + 35) * 4 = 3340; pool = 3800 - 3340 = 460
    expect(poolDollarsForOrder(order, baseTire)).toBe(460)
  })

  it('uses kylePriceOverride when set', () => {
    const order = { quantity: 2, paymentAmount: 1700, kylePriceOverride: 700 }
    // cost = (700 + 35) * 2 = 1470; pool = 1700 - 1470 = 230
    expect(poolDollarsForOrder(order, baseTire)).toBe(230)
  })

  it('uses totalPrice when paymentAmount missing (backward compat)', () => {
    const order = { quantity: 1, totalPrice: 950 }
    expect(poolDollarsForOrder(order, baseTire)).toBe(115)
  })

  it('prefers paymentAmount over totalPrice', () => {
    const order = { quantity: 1, paymentAmount: 950, totalPrice: 1000 }
    expect(poolDollarsForOrder(order, baseTire)).toBe(115)
  })

  it('handles zero quantity (prospective orders have qty=0)', () => {
    const order = { quantity: 0, paymentAmount: 0 }
    expect(poolDollarsForOrder(order, baseTire)).toBe(0)
  })

  it('handles negative quantity (pre-sold inventory)', () => {
    // qty = -1 means one sold before being in stock. Cost is "paid forward"
    // so pool reduces by the buy cost of that pre-sold tire.
    const order = { quantity: -1, paymentAmount: 0 }
    expect(poolDollarsForOrder(order, baseTire)).toBe(835)
  })

  it('rounds to cents', () => {
    const tire = { price: 100, mountCost: 3.333, deliveryCost: 0, otherCost: 0 }
    const order = { quantity: 3, paymentAmount: 500 }
    // cost = (100 + 3.333) * 3 = 309.999 -> 310.00; pool = 500 - 310 = 190
    expect(poolDollarsForOrder(order, tire)).toBe(190)
  })

  it('treats missing tire as zero cost', () => {
    const order = { quantity: 1, paymentAmount: 500 }
    expect(poolDollarsForOrder(order, null)).toBe(500)
    expect(poolDollarsForOrder(order, {})).toBe(500)
  })
})

describe('marginPercentOfPayment', () => {
  it('returns margin as % of paymentAmount', () => {
    const order = { quantity: 1, paymentAmount: 1000 }
    const tire = { price: 700, mountCost: 30, deliveryCost: 20, otherCost: 0 }
    // pool = 1000 - 750 = 250; margin % = 25
    expect(marginPercentOfPayment(order, tire)).toBe(25)
  })

  it('returns null when payment is zero or negative', () => {
    expect(marginPercentOfPayment({ paymentAmount: 0 }, baseTire)).toBeNull()
    expect(marginPercentOfPayment({ paymentAmount: -50 }, baseTire)).toBeNull()
    expect(marginPercentOfPayment({}, baseTire)).toBeNull()
  })

  it('allows negative margin (loss-leader or bad pricing)', () => {
    const order = { quantity: 1, paymentAmount: 500 }
    const tire = { price: 600, mountCost: 0, deliveryCost: 0, otherCost: 0 }
    // pool = 500 - 600 = -100; margin % = -20
    expect(marginPercentOfPayment(order, tire)).toBe(-20)
  })
})
