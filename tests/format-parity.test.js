import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import {
  formatCurrency,
  formatCurrencyOrDash,
  formatNumber,
  formatPercent,
  formatQty,
} from '../src/utils/format.js'

const require = createRequire(import.meta.url)
const fnFormat = require('../functions/format.js')

describe('functions/format parity with src/utils/format', () => {
  const samples = [0, -1.25, 42.99, Number.NaN]

  it('formatCurrency', () => {
    for (const v of samples) {
      expect(formatCurrency(v)).toBe(fnFormat.formatCurrency(v))
    }
  })

  it('formatCurrencyOrDash', () => {
    expect(formatCurrencyOrDash(null)).toBe(fnFormat.formatCurrencyOrDash(null))
    expect(formatCurrencyOrDash('')).toBe(fnFormat.formatCurrencyOrDash(''))
    for (const v of samples) {
      expect(formatCurrencyOrDash(v)).toBe(fnFormat.formatCurrencyOrDash(v))
    }
  })

  it('formatNumber', () => {
    for (const v of samples) {
      expect(formatNumber(v)).toBe(fnFormat.formatNumber(v))
    }
  })

  it('formatPercent', () => {
    for (const v of samples) {
      expect(formatPercent(v, 1)).toBe(fnFormat.formatPercent(v, 1))
      expect(formatPercent(v, 2)).toBe(fnFormat.formatPercent(v, 2))
    }
  })

  it('formatQty', () => {
    for (const v of samples) {
      expect(formatQty(v)).toBe(fnFormat.formatQty(v))
    }
  })
})
