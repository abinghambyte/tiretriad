import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { crewMemberDeliveryBumpSubline, crewMemberPendingAdjustmentsCallout } = require('./financeSlackCommands')

describe('crewMemberDeliveryBumpSubline', () => {
  it('returns empty string when deliveryBumpCount is 0', () => {
    const out = crewMemberDeliveryBumpSubline({
      totalEarned: 500,
      totalDeliveryBumps: 0,
      deliveryBumpCount: 0,
    })
    expect(out).toBe('')
    expect(out.includes('(incl.')).toBe(false)
  })

  it('returns empty string when fields are missing', () => {
    expect(crewMemberDeliveryBumpSubline({})).toBe('')
    expect(crewMemberDeliveryBumpSubline(null)).toBe('')
    expect(crewMemberDeliveryBumpSubline(undefined)).toBe('')
  })

  it('renders singular "order" for deliveryBumpCount === 1', () => {
    const out = crewMemberDeliveryBumpSubline({
      totalDeliveryBumps: 12.5,
      deliveryBumpCount: 1,
    })
    expect(out).toBe(' (incl. $12.50 from 1 delivered order)')
  })

  it('renders plural "orders" for deliveryBumpCount > 1', () => {
    const out = crewMemberDeliveryBumpSubline({
      totalDeliveryBumps: 47.2,
      deliveryBumpCount: 3,
    })
    expect(out).toBe(' (incl. $47.20 from 3 delivered orders)')
  })

  it('coerces non-numeric inputs safely', () => {
    const out = crewMemberDeliveryBumpSubline({
      totalDeliveryBumps: '15.00',
      deliveryBumpCount: '2',
    })
    expect(out).toBe(' (incl. $15.00 from 2 delivered orders)')
  })
})

describe('crewMemberPendingAdjustmentsCallout', () => {
  it('returns empty string when no adjustments', () => {
    expect(crewMemberPendingAdjustmentsCallout({ adjustments: [] })).toBe('')
    expect(crewMemberPendingAdjustmentsCallout({})).toBe('')
    expect(crewMemberPendingAdjustmentsCallout(null)).toBe('')
  })

  it('returns empty string when all adjustments are acknowledged', () => {
    const m = { adjustments: [{ delta: -10, acknowledgedBy: 'u1' }] }
    expect(crewMemberPendingAdjustmentsCallout(m)).toBe('')
  })

  it('counts unacknowledged + sums net for a single pending entry', () => {
    const m = { adjustments: [{ delta: -12.45, acknowledgedBy: null }] }
    const out = crewMemberPendingAdjustmentsCallout(m)
    expect(out).toContain('1 reconcile adjustment pending')
    expect(out).toContain('-$12.45')
  })

  it('pluralizes and ignores acked entries when summing', () => {
    const m = { adjustments: [
      { delta: -12.45, acknowledgedBy: null },
      { delta: -10.00, acknowledgedBy: 'someone' },
      { delta: -16.95, acknowledgedBy: null },
    ] }
    const out = crewMemberPendingAdjustmentsCallout(m)
    expect(out).toContain('2 reconcile adjustments pending')
    expect(out).toContain('-$29.40')
  })

  it('handles positive net (refunds)', () => {
    const m = { adjustments: [{ delta: 5.00, acknowledgedBy: null }] }
    const out = crewMemberPendingAdjustmentsCallout(m)
    expect(out).toContain('+$5.00')
  })
})
