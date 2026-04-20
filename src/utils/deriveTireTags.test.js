import { describe, expect, it } from 'vitest'
import { deriveTireTags } from './deriveTireTags.js'

describe('deriveTireTags', () => {
  it('returns an empty array for missing / empty input', () => {
    expect(deriveTireTags(null)).toEqual([])
    expect(deriveTireTags(undefined)).toEqual([])
    expect(deriveTireTags({})).toEqual([])
    expect(deriveTireTags({ description: '' })).toEqual([])
  })

  it('tags an AT/LT tire with load range and speed rating', () => {
    const tire = {
      brand: 'BFGoodrich',
      description: 'LT 265/70R17 121/118S E KO2 All-Terrain',
      lr: 'E',
    }
    const tags = deriveTireTags(tire)
    expect(tags).toContain('AT')
    expect(tags).toContain('LT')
    expect(tags).toContain('S')
    // Load range is surfaced via a dedicated LR filter chip row, not the
    // generic tag list, so LR-<letter> must NOT appear in derived tags.
    expect(tags).not.toContain('LR-E')
    // Sorted alphabetically.
    expect([...tags].sort((a, b) => a.localeCompare(b))).toEqual(tags)
  })

  it('tags an HT all-season touring tire', () => {
    const tire = {
      brand: 'Michelin',
      description: '275/65R18 116T Defender LTX M/S',
      lr: '',
    }
    const tags = deriveTireTags(tire)
    expect(tags).toContain('HT')
    expect(tags).toContain('All-Season')
  })

  it('tags a Blizzak winter tire', () => {
    const tire = {
      brand: 'Bridgestone',
      description: '215/65R16 98T Blizzak WS90 Winter',
    }
    const tags = deriveTireTags(tire)
    expect(tags).toContain('Winter')
  })

  it('tags a UHP performance tire (PS4) with its speed rating', () => {
    const tire = {
      brand: 'Michelin',
      description: '245/40ZR18 97Y Pilot Sport 4S',
    }
    const tags = deriveTireTags(tire)
    expect(tags).toContain('UHP')
    expect(tags).toContain('Performance')
    expect(tags).toContain('Y')
  })

  it('tags a commercial 22.5 tire and leaves LR out of derived tags', () => {
    const tire = {
      brand: 'Goodyear',
      description: '11R22.5 16-ply TBR Commercial',
      lr: 'H',
    }
    const tags = deriveTireTags(tire)
    expect(tags).toContain('Commercial')
    expect(tags).not.toContain('LR-H')
  })

  it('tags a mud-terrain (KM3) LT tire', () => {
    const tire = {
      brand: 'BFGoodrich',
      description: 'LT 315/70R17 121Q KM3 Mud-Terrain',
      lr: 'E',
    }
    const tags = deriveTireTags(tire)
    expect(tags).toContain('MT')
    expect(tags).toContain('LT')
    expect(tags).not.toContain('LR-E')
    // Not AT. KO2/KO3 are AT, but KM3 is MT.
    expect(tags).not.toContain('AT')
  })

  it('includes explicit useTags alongside derived tags', () => {
    const tire = {
      brand: 'Nokian',
      description: '235/65R17 108H Hakkapeliitta R3 Nokian Hak',
      useTags: ['custom', 'hero'],
    }
    const tags = deriveTireTags(tire)
    expect(tags).toContain('custom')
    expect(tags).toContain('hero')
    expect(tags).toContain('Winter')
  })

  it('de-duplicates case-insensitively and sorts alphabetically', () => {
    const tire = {
      brand: 'Michelin',
      description: '245/40ZR18 97Y Pilot Sport 4S',
      useTags: ['uhp', 'custom'],
    }
    const tags = deriveTireTags(tire)
    // "uhp" is case-insensitively the same as the derived "UHP" → single entry.
    const lower = tags.map((t) => t.toLowerCase())
    expect(new Set(lower).size).toBe(lower.length)
    expect([...tags].sort((a, b) => a.localeCompare(b))).toEqual(tags)
  })

  it('returns an empty tag array for a tire with only load range set (LR is a dedicated filter row)', () => {
    const tire = { description: '', lr: 'D' }
    const tags = deriveTireTags(tire)
    expect(tags).toEqual([])
  })

  it('tags a flotation tire (31X10.50R15)', () => {
    const tire = {
      brand: 'Goodyear',
      description: '31X10.50R15LT 109S Duratrac All-Terrain',
    }
    const tags = deriveTireTags(tire)
    expect(tags).toContain('Flotation')
    expect(tags).toContain('AT')
    expect(tags).toContain('LT')
  })

  it('tags a run-flat tire', () => {
    const tire = { brand: 'Bridgestone', description: '245/40R19 98W Potenza RE050A RFT RunFlat' }
    const tags = deriveTireTags(tire)
    expect(tags).toContain('RunFlat')
    expect(tags).toContain('UHP')
  })

  it('never throws on exotic / malformed input', () => {
    expect(() => deriveTireTags({ description: 1234 })).not.toThrow()
    expect(() => deriveTireTags({ useTags: 'not-an-array' })).not.toThrow()
    expect(() => deriveTireTags({ lr: null })).not.toThrow()
  })

  it('preserves the input (no mutation)', () => {
    const tire = {
      brand: 'Michelin',
      description: '245/40ZR18 97Y Pilot Sport 4S',
      useTags: ['hero'],
    }
    const before = JSON.stringify(tire)
    deriveTireTags(tire)
    expect(JSON.stringify(tire)).toBe(before)
  })
})
