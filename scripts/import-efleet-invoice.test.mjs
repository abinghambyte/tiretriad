import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseEfleetInvoice } from './import-efleet-invoice.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixture = readFileSync(
  join(__dirname, '__fixtures__', 'efleet-invoice-sample.html'),
  'utf8',
)

describe('parseEfleetInvoice', () => {
  it('extracts document-level metadata', () => {
    const inv = parseEfleetInvoice(fixture)
    expect(inv.docNumber).toBe('DA0065549567')
    expect(inv.dr).toBe('DR3603421')
    expect(inv.poNumber).toBe('8008135')
    expect(inv.orderNumber).toBe('D01469792')
    expect(inv.docDate).toBe('2026-02-27')
  })

  it('extracts each invoice line', () => {
    const inv = parseEfleetInvoice(fixture)
    expect(inv.lines).toHaveLength(1)
    const [l] = inv.lines
    expect(l.mspn).toBe('19901')
    expect(l.qty).toBe(8)
    expect(l.unitPrice).toBeCloseTo(758, 2)
    expect(l.discount).toBeCloseTo(259, 2)
    expect(l.netUnitPrice).toBeCloseTo(499, 2)
    expect(l.unitFet).toBeCloseTo(25.23, 2)
    expect(l.extended).toBeCloseTo(4193.84, 2)
  })

  it('extracts aggregates and totals', () => {
    const inv = parseEfleetInvoice(fixture)
    expect(inv.countyTax).toBeCloseTo(44.04, 2)
    expect(inv.localTax).toBeCloseTo(125.82, 2)
    expect(inv.stateTax).toBeCloseTo(121.62, 2)
    expect(inv.tireFee).toBeCloseTo(16, 2)
    expect(inv.bonusTotal).toBeCloseTo(3992, 2)
    expect(inv.fetTotal).toBeCloseTo(201.84, 2)
    expect(inv.invoiceTotal).toBeCloseTo(4501.32, 2)
  })

  it('throws on empty input', () => {
    expect(() => parseEfleetInvoice('')).toThrow(/empty input/i)
    expect(() => parseEfleetInvoice(null)).toThrow(/empty input/i)
  })

  it('throws on malformed input (no invoice metadata)', () => {
    expect(() => parseEfleetInvoice('<html><body>nothing here</body></html>'))
      .toThrow(/malformed/i)
  })
})
