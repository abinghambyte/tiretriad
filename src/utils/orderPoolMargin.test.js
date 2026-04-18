import { describe, it, expect } from 'vitest'
import { poolDollarsForOrder, marginPercentOfPayment } from './orderPoolMargin.js'

describe('poolDollarsForOrder', () => {
  it('computes payment minus (buy + cts) times qty', () => {
    const order = {
      quantity: 4,
      paymentAmount: 400,
    }
    const tire = {
      price: 50,
      mountCost: 5,
      deliveryCost: 5,
      otherCost: 0,
    }
    // buy 50 + cts 10 = 60 per tire; cost 240; pool 400 - 240 = 160
    expect(poolDollarsForOrder(order, tire)).toBe(160)
  })

  it('uses kylePriceOverride when set', () => {
    const order = {
      quantity: 2,
      paymentAmount: 200,
      kylePriceOverride: 40,
    }
    const tire = { price: 999, mountCost: 0, deliveryCost: 0, otherCost: 0 }
    // cost 80; pool 200 - 80 = 120
    expect(poolDollarsForOrder(order, tire)).toBe(120)
  })

  it('uses priceIntel.activeBuyPrice when present', () => {
    const order = { quantity: 1, paymentAmount: 100 }
    const tire = {
      price: 999,
      priceIntel: { activeBuyPrice: 60 },
      mountCost: 0,
      deliveryCost: 0,
      otherCost: 0,
    }
    expect(poolDollarsForOrder(order, tire)).toBe(40)
  })
})

describe('marginPercentOfPayment', () => {
  it('returns null when payment is zero', () => {
    expect(marginPercentOfPayment({ paymentAmount: 0, quantity: 1 }, { price: 10 })).toBe(null)
  })

  it('returns pool as percent of payment', () => {
    const order = { quantity: 1, paymentAmount: 100 }
    const tire = { price: 70, mountCost: 0, deliveryCost: 0, otherCost: 0 }
    expect(marginPercentOfPayment(order, tire)).toBe(30)
  })
})
