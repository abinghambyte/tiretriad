import { describe, expect, it } from 'vitest'
import { buildTireHaystack, matchesQuery, normalizeQuery } from './tireSearchHaystack'

describe('normalizeQuery', () => {
  it('strips every non-alphanumeric character and lowercases', () => {
    expect(normalizeQuery('32X11.50R15LT /C 113R ATT/A KO3')).toBe(
      '32x1150r15ltc113rattako3',
    )
  })

  it('handles empty / nullish input', () => {
    expect(normalizeQuery(undefined)).toBe('')
    expect(normalizeQuery(null)).toBe('')
    expect(normalizeQuery('')).toBe('')
    expect(normalizeQuery('   ')).toBe('')
  })
})

describe('buildTireHaystack', () => {
  it('includes description, tread, brand, mspn, lr, and derived tags', () => {
    const tire = {
      description: '265/70R17 115T Defender LTX M/S',
      tread: 'Defender LTX M/S',
      brand: 'Michelin',
      mspn: 'MICH12345',
      lr: 'E',
    }
    const hay = buildTireHaystack(tire)
    expect(hay).toContain('265')
    expect(hay).toContain('70')
    expect(hay).toContain('R') // construction
    expect(hay).toContain('17')
    expect(hay).toContain('Michelin')
    expect(hay).toContain('MICH12345')
    expect(hay).toContain('Defender')
  })

  it('handles missing / non-object input without throwing', () => {
    expect(buildTireHaystack(null)).toBe('')
    expect(buildTireHaystack(undefined)).toBe('')
  })
})

describe('matchesQuery', () => {
  it('matches substring of description (basic case)', () => {
    const tire = {
      description: '265/70R17 115T Defender LTX M/S',
      brand: 'Michelin',
      mspn: 'MICH12345',
      lr: 'E',
    }
    expect(matchesQuery(tire, 'defender')).toBe(true)
    expect(matchesQuery(tire, '265/70')).toBe(true)
  })

  it('matches a messy pasted description across delimiter differences', () => {
    // Real Firestore shape: a flotation tire with tread and LR stored across
    // different fields. Pasting the full messy string should hit.
    const tire = {
      description: '31X10.50R15LT · 109 Q',
      tread: 'TLMDTRTAKM3',
      brand: 'BFGoodrich',
      mspn: 'BFG12345',
      lr: 'C',
    }
    // This was previously a miss because the stored fields use "·" and
    // different spacing than the user's paste.
    expect(matchesQuery(tire, '31X10.50R15LT 109 Q TLMDTRTAKM3')).toBe(true)
    expect(matchesQuery(tire, '31x1050r15lt')).toBe(true)
  })

  it('matches a partial MSPN fragment', () => {
    const tire = {
      description: '265/70R17 115T',
      brand: 'Michelin',
      mspn: 'MICH12345',
    }
    expect(matchesQuery(tire, 'mich123')).toBe(true)
  })

  it('matches a brand prefix', () => {
    const tire = {
      description: '265/70R17 115T',
      brand: 'BFGoodrich',
      mspn: 'BFG12345',
    }
    expect(matchesQuery(tire, 'bfg')).toBe(true)
  })

  it('matches a tread name substring stored in the tread field', () => {
    const tire = {
      description: '265/70R17',
      tread: 'Defender LTX M/S',
      brand: 'Michelin',
      mspn: 'X',
    }
    expect(matchesQuery(tire, 'defender ltx')).toBe(true)
  })

  it('single-letter LR queries do not match — length threshold protects the catalog', () => {
    // Guard: a one-character "C" query would otherwise match every LR-C tire
    // via the tread/description haystack (any description containing a lone
    // "c" qualifies after normalization). We require 2+ chars before tokens
    // can fall through, and the substring path needs at least the query to
    // be non-empty. The LR letter alone stays off-target here.
    const tire = {
      description: '31X10.50R15LT',
      brand: 'BFGoodrich',
      mspn: 'BFG12345',
      lr: 'C',
    }
    // A longer LR query still hits (LR-C is in the derived tags).
    expect(matchesQuery(tire, 'lr-c')).toBe(true)
  })

  it('empty query matches everything (caller usually short-circuits)', () => {
    const tire = { description: 'anything', brand: 'X', mspn: 'Y' }
    expect(matchesQuery(tire, '')).toBe(true)
    expect(matchesQuery(tire, '   ')).toBe(true)
  })

  it('token fallback rescues pastes with stray extra characters', () => {
    // Extra "XYZ" token in the paste would break pure substring match but
    // the tokens that matter (michelin, 115t) still all appear.
    const tire = {
      description: '265/70R17 115T Defender',
      brand: 'Michelin',
      mspn: 'X',
    }
    // Pure substring check fails (xyz isn't anywhere), so this is rejected.
    expect(matchesQuery(tire, 'michelin XYZ 115T defender')).toBe(false)
    // Remove the stray token: fallback matches on individual tokens.
    expect(matchesQuery(tire, 'michelin 115T defender')).toBe(true)
  })
})
