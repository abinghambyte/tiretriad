// src/utils/listingAdvisor/modeWeights.js
// Weights are plain numbers so signalBreakdown stays legible. Tuning is one edit.
//
// Signals:
//   daysInStock           - how long the tire has been in inventory (tire.createdAt -> now)
//   daysSincePriceChange  - how long since the last priceIntel.sources write
//   velocity              - 100 / avgDaysToSell for this size+LR (needs >= 3 sample)
//   margin                - (retail - buy - cts) / retail  (0..1 fraction)
//   crossPost             - count of platforms where the tire is not actively listed

export const MODE_WEIGHTS = Object.freeze({
  CLEARANCE: { daysInStock: 1.5, daysSincePriceChange: 0.3, velocity: 0.3, margin: 0.2, crossPost: 0.6 },
  PROFIT:    { daysInStock: 0.2, daysSincePriceChange: 0.4, velocity: 0.6, margin: 1.4, crossPost: 0.5 },
  VELOCITY:  { daysInStock: 0.4, daysSincePriceChange: 0.4, velocity: 1.5, margin: 0.3, crossPost: 0.8 },
})

export const ADVISOR_MODES = Object.freeze(['CLEARANCE', 'PROFIT', 'VELOCITY'])

export const DEFAULT_ADVISOR_MODE = 'VELOCITY'
