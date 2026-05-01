import { describe, expect, it } from 'vitest'
import { buildListingMetadata, toCsv } from './listingMetadata.js'

const mkTire = (overrides) => ({
  id: 'T1',
  mspn: '12345',
  brand: 'MICHELIN',
  description: 'P255/55R18 109V Pilot Sport AS 4',
  tread: 'Pilot Sport AS 4',
  category: 'passenger',
  photos: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
  derivedUseTags: ['XL', 'AT'],
  ...overrides,
})

describe('buildListingMetadata', () => {
  it('returns [] for empty input', () => {
    expect(buildListingMetadata([])).toEqual([])
  })

  it('builds a full entry from a fully-populated tire', () => {
    const out = buildListingMetadata([{ tire: mkTire(), qty: 4, pricePer: 199 }])
    expect(out).toHaveLength(1)
    const e = out[0]
    expect(e).toMatchObject({
      sku: '12345',
      brand: 'MICHELIN',
      mpn: '12345',
      condition: 'new',
      qty: 4,
      price: 199,
      category: 'passenger',
      treadFamily: 'Pilot Sport AS 4',
    })
    expect(typeof e.sizeSpec).toBe('string')
    expect(e.sizeSpec).toMatch(/255/)
    expect(e.sidewallTags).toEqual(['XL'])
    expect(e.photos).toEqual(['https://example.com/a.jpg', 'https://example.com/b.jpg'])
    expect(e.copy.facebook).toMatchObject({ title: expect.any(String), description: expect.any(String) })
    expect(e.copy.offerup).toMatchObject({ title: expect.any(String), description: expect.any(String) })
    expect(e.copy.craigslist).toMatchObject({ title: expect.any(String), description: expect.any(String) })
  })

  it('normalizes brand: bfg -> BFGOODRICH, lowercase -> uppercase', () => {
    const a = buildListingMetadata([{ tire: mkTire({ brand: 'bfg' }), qty: 1, pricePer: 100 }])
    expect(a[0].brand).toBe('BFGOODRICH')
    const b = buildListingMetadata([{ tire: mkTire({ brand: 'michelin' }), qty: 1, pricePer: 100 }])
    expect(b[0].brand).toBe('MICHELIN')
  })

  it('falls back gracefully when description fails to parse', () => {
    const out = buildListingMetadata([{ tire: mkTire({ description: 'GARBAGE-NO-SIZE' }), qty: 1, pricePer: 100 }])
    expect(out[0].sizeSpec).toBeNull()
    expect(out[0].treadFamily).toBe('Pilot Sport AS 4') // tire.tread fallback
  })

  it('filters derivedUseTags to sidewall set (XL, MS)', () => {
    const out = buildListingMetadata([{ tire: mkTire({ derivedUseTags: ['XL', 'MS', 'AT', 'HT', 'All-Season'] }), qty: 1, pricePer: 100 }])
    expect(out[0].sidewallTags).toEqual(['XL', 'MS'])
  })

  it('returns empty arrays for missing photos / tags', () => {
    const out = buildListingMetadata([{ tire: mkTire({ photos: undefined, derivedUseTags: undefined }), qty: 1, pricePer: 100 }])
    expect(out[0].photos).toEqual([])
    expect(out[0].sidewallTags).toEqual([])
  })

  it('preserves input order across multiple tires', () => {
    const tires = [
      mkTire({ id: 'A', mspn: 'A' }),
      mkTire({ id: 'B', mspn: 'B' }),
      mkTire({ id: 'C', mspn: 'C' }),
    ]
    const out = buildListingMetadata(tires.map((t) => ({ tire: t, qty: 1, pricePer: 100 })))
    expect(out.map((e) => e.sku)).toEqual(['A', 'B', 'C'])
  })
})

describe('toCsv', () => {
  it('serializes a flat array of objects with header row', () => {
    const csv = toCsv([{ a: 1, b: 'hello' }, { a: 2, b: 'world' }])
    expect(csv).toBe('a,b\n1,hello\n2,world')
  })

  it('quotes fields that contain commas', () => {
    const csv = toCsv([{ a: 'foo,bar', b: 'x' }])
    expect(csv).toBe('a,b\n"foo,bar",x')
  })

  it('quotes and doubles internal double-quotes', () => {
    const csv = toCsv([{ a: 'she said "hi"', b: 'x' }])
    expect(csv).toBe('a,b\n"she said ""hi""",x')
  })

  it('quotes fields containing newlines', () => {
    const csv = toCsv([{ a: 'line1\nline2', b: 'x' }])
    expect(csv).toBe('a,b\n"line1\nline2",x')
  })

  it('emits empty cells for null/undefined', () => {
    const csv = toCsv([{ a: null, b: undefined, c: 0 }])
    expect(csv).toBe('a,b,c\n,,0')
  })

  it('returns just the header row for empty input when columns are provided', () => {
    expect(toCsv([], ['a', 'b'])).toBe('a,b')
  })

  it('returns empty string for empty input with no columns hint', () => {
    expect(toCsv([])).toBe('')
  })
})
