import { describe, expect, it } from 'vitest'
import {
  TIRE_CATEGORY_KEYS,
  CATEGORY_LABELS,
  EXPECTED_BRANDS,
} from './tireCategory.js'

describe('tireCategory constants', () => {
  it('exposes the three keys in stable order', () => {
    expect(TIRE_CATEGORY_KEYS).toEqual(['passenger', 'lightTruck', 'truck'])
  })

  it('every key has a label', () => {
    for (const k of TIRE_CATEGORY_KEYS) {
      expect(typeof CATEGORY_LABELS[k]).toBe('string')
      expect(CATEGORY_LABELS[k].length).toBeGreaterThan(0)
    }
  })

  it('exposes the three Loveland-account brands', () => {
    expect(EXPECTED_BRANDS).toEqual(['MICHELIN', 'BFGOODRICH', 'UNIROYAL'])
  })
})
