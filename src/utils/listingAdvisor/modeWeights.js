// src/utils/listingAdvisor/modeWeights.js
// Weights are plain numbers so signalBreakdown stays legible. Tuning is one edit.

export const MODE_WEIGHTS = Object.freeze({
  CLEARANCE: { age: 1.5, velocity: 0.5, margin: 0.0, crossPost: 0.8 },
  PROFIT:    { age: 0.4, velocity: 0.6, margin: 1.4, crossPost: 0.5 },
  VELOCITY:  { age: 0.6, velocity: 1.5, margin: 0.3, crossPost: 0.6 },
})

export const ADVISOR_MODES = Object.freeze(['CLEARANCE', 'PROFIT', 'VELOCITY'])

export const DEFAULT_ADVISOR_MODE = 'VELOCITY'
