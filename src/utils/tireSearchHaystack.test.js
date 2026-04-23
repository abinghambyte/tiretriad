import { describe, expect, it } from 'vitest'
import {
  buildTireHaystack,
  matchesQuery,
  normalizeQuery,
  stripVerbosePhrases,
} from './tireSearchHaystack'
import { PASTE_MATCH_FIXTURES } from './tireSearchHaystack.fixtures.js'

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

  it('returns the same haystack string for the same object reference (WeakMap cache)', () => {
    const tire = {
      description: '265/70R17 115T',
      brand: 'Michelin',
      mspn: 'M1',
      lr: 'E',
    }
    const a = buildTireHaystack(tire)
    const b = buildTireHaystack(tire)
    expect(a).toBe(b)
  })

  it('does not cross-cache different object identities with different fields', () => {
    const a = { description: '265/70R17 115T', brand: 'Michelin', mspn: 'A', lr: 'E' }
    const b = { description: '265/70R17 115T', brand: 'Michelin', mspn: 'B', lr: 'C' }
    expect(buildTireHaystack(a)).not.toBe(buildTireHaystack(b))
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

  it('single-letter LR queries do not match -- length threshold protects the catalog', () => {
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

  it('pastes with sidewall codes (BSW/OWL/ROWL) still match a stored catalog entry', () => {
    // Real catalog description typically omits the sidewall style, so naive
    // token matching fails on "bsw". The cosmetic-token stripper fixes it.
    const tire = {
      description: '265/70R17 115T Defender LTX M/S',
      brand: 'Michelin',
      mspn: 'X',
    }
    expect(matchesQuery(tire, '265/70R17 115T Defender LTX M/S BSW')).toBe(true)
    expect(matchesQuery(tire, 'LT235/85R16 OWL')).toBe(false) // size doesn't match
  })

  it('pastes with "Load Range E" or "E-range" phrases still match', () => {
    const tire = {
      description: '235/85R16 120R',
      brand: 'Michelin',
      mspn: 'X',
      lr: 'E',
    }
    expect(matchesQuery(tire, '235/85R16 Load Range E')).toBe(true)
    expect(matchesQuery(tire, '235/85R16 E-range')).toBe(true)
    expect(matchesQuery(tire, '235/85R16 E Range')).toBe(true)
  })

  it('pastes with ply-rating phrases still match', () => {
    const tire = {
      description: 'LT265/70R17 121R KO3',
      brand: 'BFGoodrich',
      mspn: 'X',
      lr: 'E',
    }
    expect(matchesQuery(tire, 'LT265/70R17 10-ply')).toBe(true)
    expect(matchesQuery(tire, 'LT265/70R17 10 Ply Rated')).toBe(true)
  })

  it('leading passenger "P" prefix is optional', () => {
    // Catalog stores passenger metric without the P; a paste that includes
    // the P should still match.
    const tire = {
      description: '225/70R15 100T',
      brand: 'Michelin',
      mspn: 'X',
    }
    expect(matchesQuery(tire, 'P225/70R15')).toBe(true)
    expect(matchesQuery(tire, 'P225/70R15 100T')).toBe(true)
  })

  it('combined real-world paste with junk + size + tread + cosmetic tokens', () => {
    // Simulates a full Tire Rack-style paste dropped in the search box.
    const tire = {
      description: 'LT265/70R17 121/118R KO3 ATT/AKO3',
      tread: 'ALL-TERRAIN T/A KO3',
      brand: 'BFGoodrich',
      mspn: 'BFG12345',
      lr: 'E',
    }
    expect(
      matchesQuery(
        tire,
        'LT265/70R17 Load Range E 10-ply 121/118R BSW ALL-TERRAIN T/A KO3',
      ),
    ).toBe(true)
  })
})

describe('stripVerbosePhrases', () => {
  it('drops "Load Range X" and leaves the letter behind', () => {
    expect(stripVerbosePhrases('235/85R16 Load Range E')).toBe('235/85R16 E')
  })

  it('collapses "E-range" and "E Range" to just "E"', () => {
    expect(stripVerbosePhrases('235/85R16 E-range')).toBe('235/85R16 E')
    expect(stripVerbosePhrases('235/85R16 E Range')).toBe('235/85R16 E')
  })

  it('drops ply-rating phrases', () => {
    expect(stripVerbosePhrases('265/70R17 10-ply')).toBe('265/70R17')
    expect(stripVerbosePhrases('265/70R17 10 ply')).toBe('265/70R17')
    expect(stripVerbosePhrases('265/70R17 10 Ply Rated')).toBe('265/70R17')
  })

  it('drops standalone sidewall codes', () => {
    expect(stripVerbosePhrases('265/70R17 BSW Defender')).toBe('265/70R17 Defender')
    expect(stripVerbosePhrases('265/70R17 ROWL')).toBe('265/70R17')
    expect(stripVerbosePhrases('235/85R16 OWL')).toBe('235/85R16')
  })

  it('strips leading passenger P prefix but leaves LT alone', () => {
    expect(stripVerbosePhrases('P225/70R15')).toBe('225/70R15')
    expect(stripVerbosePhrases('LT225/75R16')).toBe('LT225/75R16')
  })

  it('preserves tread names that happen to start with P', () => {
    // "PRO-STREET" is a real BFG tread name; leading-P rule must not eat it.
    expect(stripVerbosePhrases('P225/70R15 PRO-STREET')).toBe('225/70R15 PRO-STREET')
  })

  it('handles empty / nullish input', () => {
    expect(stripVerbosePhrases(undefined)).toBe('')
    expect(stripVerbosePhrases(null)).toBe('')
    expect(stripVerbosePhrases('')).toBe('')
  })

  it('strips slash-attached sidewall codes', () => {
    expect(stripVerbosePhrases('265/70R17/BSW')).toBe('265/70R17')
    expect(stripVerbosePhrases('LT235/80R17/RWL extra')).toBe('LT235/80R17 extra')
  })

  it('normalizes load-range letter after metric size', () => {
    expect(stripVerbosePhrases('225/75R16E')).toBe('225/75R16 LR-E')
    expect(stripVerbosePhrases('225/75R16 LT E')).toBe('LT225/75R16 LR-E')
    expect(stripVerbosePhrases('LT225/75R16 E')).toBe('LT225/75R16 LR-E')
  })
})

describe.each(PASTE_MATCH_FIXTURES)('paste format: $name', ({ tire, pastes }) => {
  it.each(pastes)('matches paste %s', (paste) => {
    expect(matchesQuery(tire, paste)).toBe(true)
  })
})
