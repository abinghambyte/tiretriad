import { describe, it, expect } from 'vitest'
import { TOP_SELLERS_PALETTE, paletteForRank } from './topSellersPalette'

describe('TOP_SELLERS_PALETTE', () => {
  it('exposes 10 entries with distinct primary and accent', () => {
    expect(TOP_SELLERS_PALETTE).toHaveLength(10)
    for (const entry of TOP_SELLERS_PALETTE) {
      expect(entry.primary).toMatch(/^#[0-9a-f]{6}$/i)
      expect(entry.accent).toMatch(/^#[0-9a-f]{6}$/i)
      expect(entry.primary.toLowerCase()).not.toEqual(entry.accent.toLowerCase())
    }
  })
})

describe('paletteForRank', () => {
  it('returns the entry for rank 1', () => {
    expect(paletteForRank(1)).toEqual({ primary: '#fbbf24', accent: '#94a3b8' })
  })

  it('returns the entry for rank 10', () => {
    expect(paletteForRank(10)).toEqual({ primary: '#94a3b8', accent: '#fcd34d' })
  })

  it('wraps rank 11 back to rank 1', () => {
    expect(paletteForRank(11)).toEqual(paletteForRank(1))
  })

  it('wraps rank 0 to rank 10', () => {
    expect(paletteForRank(0)).toEqual(paletteForRank(10))
  })

  it('falls back to rank 1 for non-finite input', () => {
    expect(paletteForRank(NaN)).toEqual(TOP_SELLERS_PALETTE[0])
    expect(paletteForRank(undefined)).toEqual(TOP_SELLERS_PALETTE[0])
  })
})
