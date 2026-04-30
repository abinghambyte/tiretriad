import { describe, expect, it } from 'vitest'
import { parseDescription } from './parseTireDescription.js'

describe('parseDescription - existing happy paths regression', () => {
  it('parses standard metric with load + speed + tread', () => {
    const p = parseDescription('265/70R17 115T Defender LTX')
    expect(p.parseKind).toBe('metric')
    expect(p.width).toBe(265)
    expect(p.aspectRatio).toBe(70)
    expect(p.rimDiameter).toBe(17)
    expect(p.loadIndex).toBe(115)
    expect(p.speedRating).toBe('T')
    expect(p.treadName).toBe('Defender LTX')
  })

  it('parses LT-prefixed metric (no space)', () => {
    const p = parseDescription('LT265/70R17 121S KO2')
    expect(p.parseKind).toBe('metric')
    expect(p.ltPrefixedMetric).toBe(true)
    expect(p.width).toBe(265)
    expect(p.loadIndex).toBe(121)
    expect(p.speedRating).toBe('S')
    expect(p.treadName).toBe('KO2')
  })

  it('parses flotation', () => {
    const p = parseDescription('33X12.50R17LT 121Q KO2')
    expect(p.parseKind).toBe('flotation')
    expect(p.width).toBe(33)
    expect(p.flotationMid).toBe('12.50')
    expect(p.rimDiameter).toBe(17)
    expect(p.trailingLt).toBe(true)
    expect(p.loadIndex).toBe(121)
    expect(p.speedRating).toBe('Q')
  })
})

describe('parseDescription - eFleet quirks (slash-prefixed sidewall codes, spaced LT)', () => {
  it('parses LT with a SPACE before the size', () => {
    const p = parseDescription('LT 325/60R20 128S KO3')
    expect(p.parseKind).toBe('metric')
    expect(p.ltPrefixedMetric).toBe(true)
    expect(p.width).toBe(325)
    expect(p.aspectRatio).toBe(60)
    expect(p.rimDiameter).toBe(20)
    expect(p.loadIndex).toBe(128)
    expect(p.speedRating).toBe('S')
    expect(p.treadName).toBe('KO3')
  })

  it('parses P-metric with a SPACE before the size', () => {
    const p = parseDescription('P 215/65R17 99H Defender')
    expect(p.parseKind).toBe('metric')
    expect(p.width).toBe(215)
    expect(p.loadIndex).toBe(99)
    expect(p.speedRating).toBe('H')
    expect(p.treadName).toBe('Defender')
  })

  it('strips a slash-prefixed /F sidewall code between rim and load index', () => {
    const p = parseDescription('LT325/60R20/F 128S AT T/A KO3')
    expect(p.parseKind).toBe('metric')
    expect(p.width).toBe(325)
    expect(p.loadIndex).toBe(128)
    expect(p.speedRating).toBe('S')
    expect(p.treadName).toBe('AT T/A KO3')
  })

  it('strips /BSW between rim and load index', () => {
    const p = parseDescription('265/70R17/BSW 115T Defender LTX')
    expect(p.parseKind).toBe('metric')
    expect(p.loadIndex).toBe(115)
    expect(p.speedRating).toBe('T')
    expect(p.treadName).toBe('Defender LTX')
  })

  it('strips /OWL', () => {
    const p = parseDescription('265/70R17/OWL 115T KO2')
    expect(p.parseKind).toBe('metric')
    expect(p.treadName).toBe('KO2')
  })

  it('strips /RWL', () => {
    const p = parseDescription('LT285/70R17/RWL 121S KO2')
    expect(p.parseKind).toBe('metric')
    expect(p.treadName).toBe('KO2')
  })

  it('strips /ORWL', () => {
    const p = parseDescription('LT285/70R17/ORWL 121S KM3')
    expect(p.parseKind).toBe('metric')
    expect(p.treadName).toBe('KM3')
  })

  it('handles the full eFleet 13906 line: LT space, /F prefix, trailing LR letter', () => {
    const p = parseDescription('LT 325/60R20 /F 128S AT T/A KO3 F')
    expect(p.parseKind).toBe('metric')
    expect(p.ltPrefixedMetric).toBe(true)
    expect(p.width).toBe(325)
    expect(p.aspectRatio).toBe(60)
    expect(p.rimDiameter).toBe(20)
    expect(p.loadIndex).toBe(128)
    expect(p.speedRating).toBe('S')
    // The trailing LR letter "F" is left in the tread name; LR has its own
    // column and stripping single letters at the tail risks eating real
    // tread-name letters. Cosmetic only.
    expect(p.treadName).toMatch(/^AT T\/A KO3/)
  })
})
