// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useEFleetDiff } from './useEFleetDiff.js'

const mkTire = (overrides) => ({
  id: '12345',
  mspn: '12345',
  brand: 'MICHELIN',
  description: 'P255/55R18 109V PILOT SPORT',
  fet: 0,
  price: 100,
  lr: '',
  tread: 'PILOT SPORT',
  ...overrides,
})

const mkRecord = (overrides) => ({
  fet: 0,
  price: 100,
  brand: 'MICHELIN',
  description: 'P255/55R18 109V PILOT SPORT',
  lr: '',
  tread: 'PILOT SPORT',
  ...overrides,
})

describe('useEFleetDiff', () => {
  it('returns empty buckets for empty inputs', () => {
    const { result } = renderHook(() => useEFleetDiff([], {}))
    expect(result.current.mismatched).toEqual([])
    expect(result.current.invOnly).toEqual([])
    expect(result.current.eFleetOnly).toEqual([])
    expect(result.current.aligned).toEqual([])
    expect(result.current.counts.total).toBe(0)
  })

  it('aligns tires that exactly match the eFleet record', () => {
    const tires = [mkTire({ id: '1', mspn: '1' })]
    const records = { '1': mkRecord() }
    const { result } = renderHook(() => useEFleetDiff(tires, records))
    expect(result.current.aligned).toHaveLength(1)
    expect(result.current.mismatched).toEqual([])
  })

  it('flags price mismatch as mismatched with a price delta', () => {
    const tires = [mkTire({ id: '1', mspn: '1', price: 100 })]
    const records = { '1': mkRecord({ price: 150 }) }
    const { result } = renderHook(() => useEFleetDiff(tires, records))
    expect(result.current.mismatched).toHaveLength(1)
    const entry = result.current.mismatched[0]
    expect(entry.mspn).toBe('1')
    expect(entry.deltas).toContainEqual({ field: 'price', before: 100, after: 150 })
  })

  it('flags fet mismatch and lists multi-field deltas', () => {
    const tires = [mkTire({ id: '1', mspn: '1', fet: 3, price: 100 })]
    const records = { '1': mkRecord({ fet: 0, price: 95 }) }
    const { result } = renderHook(() => useEFleetDiff(tires, records))
    const entry = result.current.mismatched[0]
    const fields = entry.deltas.map((d) => d.field).sort()
    expect(fields).toEqual(['fet', 'price'])
  })

  it('marks brand mismatches with isBrandConflict', () => {
    const tires = [mkTire({ id: '1', mspn: '1', brand: 'BFGOODRICH' })]
    const records = { '1': mkRecord({ brand: 'MICHELIN' }) }
    const { result } = renderHook(() => useEFleetDiff(tires, records))
    const entry = result.current.mismatched[0]
    expect(entry.isBrandConflict).toBe(true)
    // Synthetic 'brand' delta is stripped from the public list — pill covers
    // it. A brand-only conflict (otherwise-aligned fields) lands in
    // mismatched with deltas: [].
    expect(entry.deltas).toEqual([])
  })

  it('carries tireFet/tirePrice on invOnly entries', () => {
    const tires = [mkTire({ id: '1', mspn: '1', fet: 3, price: 100 })]
    const { result } = renderHook(() => useEFleetDiff(tires, {}))
    const entry = result.current.invOnly[0]
    expect(entry.tireFet).toBe(3)
    expect(entry.tirePrice).toBe(100)
    expect(entry.recordFet).toBeNull()
    expect(entry.recordPrice).toBeNull()
  })

  it('carries recordFet/recordPrice on eFleetOnly entries', () => {
    const records = { '1': mkRecord({ fet: 5, price: 200 }) }
    const { result } = renderHook(() => useEFleetDiff([], records))
    const entry = result.current.eFleetOnly[0]
    expect(entry.recordFet).toBe(5)
    expect(entry.recordPrice).toBe(200)
    expect(entry.tireFet).toBeNull()
    expect(entry.tirePrice).toBeNull()
  })

  it('inv-only when tire exists but no record', () => {
    const tires = [mkTire({ id: '1', mspn: '1' })]
    const { result } = renderHook(() => useEFleetDiff(tires, {}))
    expect(result.current.invOnly).toHaveLength(1)
    expect(result.current.invOnly[0].mspn).toBe('1')
  })

  it('inv-only carries isOffProgram when tire.offProgramAt set', () => {
    const tires = [mkTire({ id: '1', mspn: '1', offProgramAt: 'ts' })]
    const { result } = renderHook(() => useEFleetDiff(tires, {}))
    expect(result.current.invOnly[0].isOffProgram).toBe(true)
  })

  it('efleet-only when record exists but no tire', () => {
    const records = { '1': mkRecord() }
    const { result } = renderHook(() => useEFleetDiff([], records))
    expect(result.current.eFleetOnly).toHaveLength(1)
    expect(result.current.eFleetOnly[0].mspn).toBe('1')
  })

  it('excludes archived tires from all buckets', () => {
    const tires = [mkTire({ id: '1', mspn: '1', archivedAt: 'ts' })]
    const records = { '1': mkRecord({ price: 999 }) }
    const { result } = renderHook(() => useEFleetDiff(tires, records))
    expect(result.current.mismatched).toEqual([])
    expect(result.current.invOnly).toEqual([])
    expect(result.current.aligned).toEqual([])
    // The record's MSPN is reachable from records but its tire is excluded;
    // since the tire was excluded, the MSPN should land in eFleetOnly so the
    // operator sees that the eFleet has this SKU but the active inventory
    // does not.
    expect(result.current.eFleetOnly).toHaveLength(1)
  })

  it('counts populate accurately', () => {
    const tires = [
      mkTire({ id: '1', mspn: '1', price: 100 }),                   // aligned
      mkTire({ id: '2', mspn: '2', price: 100 }),                   // mismatched
      mkTire({ id: '3', mspn: '3' }),                               // inv-only
    ]
    const records = {
      '1': mkRecord({ price: 100 }),
      '2': mkRecord({ price: 999 }),
      '4': mkRecord(),                                              // efleet-only
    }
    const { result } = renderHook(() => useEFleetDiff(tires, records))
    expect(result.current.counts).toEqual({
      mismatched: 1,
      invOnly: 1,
      eFleetOnly: 1,
      aligned: 1,
      total: 4,
    })
  })

  it('regression: 54802-shaped row (brand conflict + price + fet deltas)', () => {
    const tires = [
      mkTire({
        id: '54802',
        mspn: '54802',
        brand: 'BFGOODRICH',
        description: '42X14.50R17LT 128Q MDTRTA KM3 D',
        price: 686.40,
        fet: 4.44,
        lr: 'E',
        tread: 'MDTRTA KM3',
      }),
    ]
    const records = {
      '54802': {
        brand: 'MICHELIN',
        description: '275/65R18 116T PRIMACY XC',
        price: 237.90,
        fet: 0,
        lr: '',
        tread: 'PRIMACY XC',
      },
    }
    const { result } = renderHook(() => useEFleetDiff(tires, records))
    expect(result.current.mismatched).toHaveLength(1)
    const e = result.current.mismatched[0]
    expect(e.isBrandConflict).toBe(true)
    const fields = e.deltas.map((d) => d.field).sort()
    expect(fields).toEqual(['description', 'fet', 'lr', 'price', 'tread'])
  })
})
