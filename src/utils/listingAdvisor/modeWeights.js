// src/utils/listingAdvisor/modeWeights.js
// Weights are plain numbers so signalBreakdown stays legible. Tuning is one edit.
//
// Signals (dropship model, no physical inventory):
//   daysSincePriceChange   - days since the last priceIntel.sources write
//   daysSinceLastListed    - days since any platform's lastPostedAt (stale catalog SKU)
//   velocity               - 100 / avgDaysToSell for this size+LR (needs >= 3 sample)
//   margin                 - (retail - buy - cts) / retail  (0..1 fraction)
//   crossPost              - count of platforms where the SKU is not actively listed

export const MODE_WEIGHTS = Object.freeze({
  COVERAGE: { daysSincePriceChange: 0.2, daysSinceLastListed: 0.4, velocity: 0.3, margin: 0.0, crossPost: 1.8 },
  PROFIT:   { daysSincePriceChange: 0.4, daysSinceLastListed: 0.3, velocity: 0.6, margin: 1.4, crossPost: 0.5 },
  VELOCITY: { daysSincePriceChange: 0.4, daysSinceLastListed: 0.3, velocity: 1.5, margin: 0.3, crossPost: 0.8 },
})

export const ADVISOR_MODES = Object.freeze(['COVERAGE', 'PROFIT', 'VELOCITY'])

export const DEFAULT_ADVISOR_MODE = 'VELOCITY'
