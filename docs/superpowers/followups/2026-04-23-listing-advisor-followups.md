# Listing Advisor v1 -- follow-ups before prod flag flip

Source: code review on PR #104 (branch `listing-advisor`). Flag is off in prod, so none of these block merge. All of them block `flags.listingAdvisor` being defaulted to true in `src/utils/featureFlags.js` (plan Task 14).

Tackle in order. Each item is independently shippable.

---

## 1. Schema fix in `useAdvisorSignals` (CRITICAL) -- DONE, PR #105

Shipped on branch `advisor-signals-schema-fix`, stacked on `listing-advisor`. Approach taken: read `priceIntel.sources` for price-change timestamps (so follow-up #4 is no longer needed -- can close or downgrade). Join orders to tires via `mspn` and use `tire.createdAt` as intake. Full spec in the commit message on `2921bb3`.



**File:** `src/hooks/useAdvisorSignals.js`

Hook currently reads fields that don't exist on real tire docs. Rewrite against the real schema:

- Missing-platform count: was `tire.listedEbay/listedMarketplace/listedCraigslist` -> use `platformListings[k].status === 'active'` (see `src/utils/listingStatus.js`, `MarginTable.jsx:50-80`).
- Buy price: was `tire.buyPrice` -> `tireCatalogBuyNumber(t)`.
- Overhead: was `tire.ctsTotal` -> `effectiveCts(t)`.
- `daysSincePriceChange`: was `tire.priceHistory` (never written) -> interim: use max `platformListings[k].lastPricedAt` or fall back to `updatedAt`. Long-term: (3) below adds a real `priceHistory` writer.
- `avgDaysToSell`: orders currently have `tireId`, not denormalized size. Rejoin orders -> tires on `tireId`, then group by size+LR.

Update `useAdvisorSignals.test.js` fixtures to match real schema.

## 2. Defer `ListingAdvisorPanel` narrate to on-expand -- DONE, PR #106

**File:** `src/components/tires/ListingAdvisorPanel.jsx`

Panel's `useEffect` currently fires `advisorNarrate` on mount. Mounted inside per-tire `.map()` in `ListingGenerator.jsx` -> N callables on bulk-modal open. Follow the dashboard "Why?" pattern: render rank + signal strip by default, fire narrate only when user clicks an expand button. Reuse the `ExpandableRow` idiom from `NextToPostSurface.jsx` if it fits.

## 3. Expand `advisorNarrate` server payload

**File:** `functions/advisorNarrate.js` (`buildPayload`)

Currently forwards `brand / tread / size / lr / mspn / price / kyleFrozen / mode / comps`. Spec § Payload promised the full signal surface. Add:

- `inventory.daysInStock`, `inventory.daysSincePriceChange`
- `velocity.avgDaysToSell`, `velocity.sampleSize`
- `crossPost.missingPlatforms` (array of names)
- `margin.retail`, `margin.buy`, `margin.overhead`, `margin.headroomPct`

Pass these from the client in the `request.data` so the function doesn't have to re-derive. That means the ranker's `signalBreakdown` should flow through to the callable invocation.

## 4. Add `priceHistory` write path -- superseded by #1

#1 reads `priceIntel.sources` directly, which every writer already appends to. No new `priceHistory` field needed. Leaving this section as a tombstone.

Original note below, kept for context:


Wherever prices are written today (`priceIntel` updates, manual price edits, platform syncs), append `{ price, writtenAt }` to a `priceHistory` subcollection or field on the tire doc. Needed for (1) to produce real `daysSincePriceChange` values over time instead of falling back to `updatedAt`.

Grep for price-write sites:
```
grep -rn "retail.*updateDoc\|updateDoc.*retail\|priceIntel" src/
```

## 5. Tire detail drawer decision

The `doNotList` checkbox currently lives in the CTS overhead editor (`MarginTable.jsx`). No dedicated tire detail drawer exists. Either accept this as the right home, or build a proper detail drawer and move it. Call with Alex.

---

## After all five: Task 14 rollout

- Flip `flags.listingAdvisor` default to `true` in `src/utils/featureFlags.js`.
- Delete `HiddenGemsSurface.jsx` + test.
- Remove conditional in `Dashboard.jsx`.
- Drop unused `hiddenGems` derivation from `useDashboardSignals.js`.

Pre-flip gate: eyeball rank ordering on ~20 real tires in staging, confirm narrator output quality on 5-10 tires.
