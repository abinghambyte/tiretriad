/**
 * Paste-vs-catalog regression fixtures for `matchesQuery`.
 * Add rows here instead of hand-writing new `it()` blocks in the test file.
 */
export const PASTE_MATCH_FIXTURES = [
  {
    name: 'LT + load range, separator variants',
    tire: {
      description: 'LT225/75R16 110S',
      mspn: 'BFG-LT-22575',
      lr: 'E',
      brand: 'BFGoodrich',
      tread: 'All-Terrain T/A',
    },
    pastes: ['LT225/75R16 E', '225/75R16 LT E', '225/75R16E'],
  },
  {
    name: 'Speed rating isolated after load index (spaced 109 V)',
    tire: {
      description: 'P255/55R18 109V XL',
      mspn: 'MICH-P255',
      lr: '',
      brand: 'Michelin',
      tread: 'Pilot Sport',
    },
    pastes: ['P255/55R18 109 V XL', '255/55R18 109 V'],
  },
  {
    name: 'Slash-attached BSW after rim',
    tire: {
      description: '265/70R17 115T Defender LTX M/S',
      mspn: 'MICH-DEF',
      lr: '',
      brand: 'Michelin',
      tread: 'Defender LTX M/S',
    },
    pastes: ['265/70R17/BSW Defender', '265/70R17/OWL'],
  },
  {
    name: 'Flotation LT size paste',
    tire: {
      description: '32X11.50R15LT 113Q',
      mspn: 'BFG-FLOT',
      lr: 'C',
      brand: 'BFGoodrich',
      tread: 'Mud-Terrain T/A KM3',
    },
    pastes: ['32X11.50R15LT', '32 X 11.50 R 15 LT'],
  },
  {
    name: 'Regression: messy delimiter paste still hits (pre-existing path)',
    tire: {
      description: '31X10.50R15LT · 109 Q',
      mspn: 'BFG12345',
      lr: 'C',
      brand: 'BFGoodrich',
      tread: 'TLMDTRTAKM3',
    },
    pastes: ['31X10.50R15LT 109 Q TLMDTRTAKM3'],
  },
  {
    name: 'X2L fragment when MSPN carries the code (tread canonicalization still separate)',
    tire: {
      description: '275/55R20 113T Open Country A/T III',
      mspn: 'TOYO-X2L-27555',
      lr: 'SL',
      brand: 'Toyo',
      tread: 'Open Country A/T III',
    },
    pastes: ['TOYO-X2L-27555', '275/55R20 113T X2L'],
  },
]
