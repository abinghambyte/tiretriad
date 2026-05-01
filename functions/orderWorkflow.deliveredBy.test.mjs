import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  buildCompletionSummaryBlocks,
  buildDeliveredByButtons,
  shouldOfferDeliveredByButtons,
  deliveredByKeyFromActionId,
} = require('./orderWorkflow')

describe('shouldOfferDeliveredByButtons', () => {
  it('returns true for delivery orders without deliveredBy', () => {
    expect(shouldOfferDeliveredByButtons({ fulfillment: 'delivery' })).toBe(true)
    expect(
      shouldOfferDeliveredByButtons({ fulfillment: 'Delivery', deliveredBy: '' }),
    ).toBe(true)
    expect(
      shouldOfferDeliveredByButtons({ fulfillment: 'delivery', deliveredBy: null }),
    ).toBe(true)
  })

  it('returns false when deliveredBy is already set', () => {
    expect(
      shouldOfferDeliveredByButtons({ fulfillment: 'delivery', deliveredBy: 'dj' }),
    ).toBe(false)
    expect(
      shouldOfferDeliveredByButtons({ fulfillment: 'delivery', deliveredBy: 'KYLE' }),
    ).toBe(false)
  })

  it('returns false for pickup orders', () => {
    expect(shouldOfferDeliveredByButtons({ fulfillment: 'pickup' })).toBe(false)
  })

  it('returns false for empty / unknown input', () => {
    expect(shouldOfferDeliveredByButtons(null)).toBe(false)
    expect(shouldOfferDeliveredByButtons({})).toBe(false)
  })
})

describe('buildDeliveredByButtons', () => {
  it('renders three buttons (Alex, DJ, Kyle) with stable action_ids and JSON values', () => {
    const block = buildDeliveredByButtons('order-123')
    expect(block.type).toBe('actions')
    expect(block.block_id).toBe('delivered_by_actions')
    expect(block.elements).toHaveLength(3)
    const ids = block.elements.map((e) => e.action_id)
    expect(ids).toEqual(['delivered_by_alex', 'delivered_by_dj', 'delivered_by_kyle'])
    const labels = block.elements.map((e) => e.text.text)
    expect(labels).toEqual([
      'Delivered by Alex',
      'Delivered by DJ',
      'Delivered by Kyle',
    ])
    for (const el of block.elements) {
      expect(el.type).toBe('button')
      expect(JSON.parse(el.value)).toEqual({ orderId: 'order-123' })
    }
  })
})

describe('deliveredByKeyFromActionId', () => {
  it('maps action_ids to crew keys', () => {
    expect(deliveredByKeyFromActionId('delivered_by_alex')).toBe('alex')
    expect(deliveredByKeyFromActionId('delivered_by_dj')).toBe('dj')
    expect(deliveredByKeyFromActionId('delivered_by_kyle')).toBe('kyle')
  })
  it('returns null for anything else', () => {
    expect(deliveredByKeyFromActionId('cancel_order')).toBe(null)
    expect(deliveredByKeyFromActionId('delivered_by_someone')).toBe(null)
    expect(deliveredByKeyFromActionId('')).toBe(null)
    expect(deliveredByKeyFromActionId(undefined)).toBe(null)
  })
})

describe('buildCompletionSummaryBlocks', () => {
  const baseOrder = {
    id: 'o1',
    mspn: 'M1',
    quantity: 4,
    customerName: 'Test Customer',
    paymentAmount: 100,
    fulfillment: 'delivery',
    logisticsMethod: 'pickup',
    totalFulfillmentMinutes: 90,
  }

  it('appends the delivered-by buttons for delivery orders without deliveredBy', () => {
    const blocks = buildCompletionSummaryBlocks(baseOrder, 'https://portal.example')
    expect(blocks).toHaveLength(2)
    expect(blocks[0].type).toBe('section')
    expect(blocks[1].type).toBe('actions')
    expect(blocks[1].block_id).toBe('delivered_by_actions')
  })

  it('omits the buttons when deliveredBy is already set', () => {
    const blocks = buildCompletionSummaryBlocks(
      { ...baseOrder, deliveredBy: 'dj' },
      'https://portal.example',
    )
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('section')
  })

  it('omits the buttons for pickup orders', () => {
    const blocks = buildCompletionSummaryBlocks(
      { ...baseOrder, fulfillment: 'pickup' },
      'https://portal.example',
    )
    expect(blocks).toHaveLength(1)
  })
})
