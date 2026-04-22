# Listing Advisor — Design Spec

**Date:** 2026-04-22
**Status:** v1 design locked
**Author:** Alex + Claude (brainstorming session)

---

## Goal

Replace the Dashboard "Hidden Gems" widget with a smarter **Listing Advisor** that ranks inventory by "what to post next," explains *why* a tire is ranked where it is, and flags market contradictions. Also surfaces per-SKU advisor detail inside ListingGenerator.

## Non-goals (v1)

- No eBay API integration (a clean seam is designed in so #1 drops in later).
- No SellerChamp integration.
- No platform-specific listing tone (single listing output remains).
- No signal sparklines, nightly score recalc, batch listing queue, velocity bootstrap — all deferred to v2.

---

## Architecture

Three layers, each independently testable:

1. **Ranker (pure function, deterministic).** `src/utils/listingAdvisor/ranker.js` — takes an array of enriched tire records + the active `mode` and returns the same array sorted with a `rankScore` and `signalBreakdown` attached to each row. No I/O, no Firestore, no LLM.

2. **Signal sources (Firestore-backed selectors).** `src/hooks/useAdvisorSignals.js` — composes the existing `useTires` / margin data with two new slim datasets: per-tire `daysSincePriceChange` (derived from `priceHistory`) and per-size `avgDaysToSell` velocity (derived from completed orders). Also exposes `doNotList` and `kyleFrozen` booleans per tire.

3. **LLM narrator (on-demand).** Firebase callable `advisorNarrate` — invoked only when a user expands a row or opens ListingGenerator. Cached in Firestore (`advisorCache/{tireId}_{mode}`) with a 24h TTL so repeat expands are free. Uses Gemini Flash (lowest cost + fast; already used elsewhere in the app).

Data flow:

```
Firestore (tires, orders, priceHistory)
          │
          ▼
useAdvisorSignals  ──► enriched tires with signals + doNotList/kyleFrozen
          │
          ▼
ranker(tires, mode) ──► sorted list with rankScore + signalBreakdown
          │
          ├─► NextToPostWidget (dashboard)
          └─► ListingGenerator advisor panel
                    │
                    ▼
          advisorNarrate callable ──► LLM narrative + shadow flag
                    │
                    ▼
          advisorCache (24h TTL)
```

---

## The Ranker

### Formula

```
rankScore = (ageWeight        × daysSincePriceChange)
          + (velocityWeight   × velocityUrgency)
          + (marginWeight     × marginHeadroomPct)
          + (crossPostWeight  × missingPlatformCount)
```

- `daysSincePriceChange`: clamp to [0, 180]. "Age" is since last repricing, not since intake — a tire repriced yesterday is active regardless of stock age.
- `velocityUrgency`: `100 / max(avgDaysToSell, 1)` if sample size ≥ 3, else `0`. Unknown velocity contributes nothing in v1.
- `marginHeadroomPct`: current gross margin as a percent of sell price.
- `missingPlatformCount`: count of platforms (ebay, marketplace, craigslist) the tire is **not** currently listed on. This is the absorbed Hidden Gems signal.

Tires with `doNotList: true` are filtered out before ranking, never scored.

### Mode weights

| Mode       | age | velocity | margin | crossPost |
|------------|-----|----------|--------|-----------|
| Clearance  | 1.5 | 0.5      | 0.0    | 0.8       |
| Profit     | 0.4 | 0.6      | 1.4    | 0.5       |
| Velocity   | 0.6 | 1.5      | 0.3    | 0.6       |

Weights live in a single named constant `MODE_WEIGHTS` in `ranker.js` so tuning is one edit. They are plain numbers — intentionally no magic scaling — so `signalBreakdown` stays legible.

### Signal breakdown

Each ranked tire carries:
```js
{
  rankScore: 174.3,
  signalBreakdown: {
    age:        { raw: 44,  weighted: 66.0 },
    velocity:   { raw: 18,  weighted: 5.55 },
    margin:     { raw: 0.32, weighted: 44.8 },
    crossPost:  { raw: 2,   weighted: 1.6 },
  },
}
```

This feeds the v2 sparkline UI without ranker changes.

---

## Data: what's needed from Firestore

### Existing
- `tires/{id}` — brand, tread, size, LR, price, costs, listing status per platform.
- `orders/{id}` — completed orders with `buyPrice`, `paymentAmount`, `completedAt`, tire refs.

### New fields on `tires/{id}`
- `priceHistory: [{ price: number, at: Timestamp }]` — append on every price change (already partially tracked in `priceIntel`; consolidate here). `daysSincePriceChange = now - priceHistory[-1].at`.
- `doNotList: boolean` (default false). Editable from the tire detail drawer; scoring skips these.
- `kyleFrozen: boolean` — true when Kyle has locked the price. Read-only in UI. Surface as 🔒 badge. Passed to LLM but does not affect score.

### Derived (computed in `useAdvisorSignals`)
- `avgDaysToSell` per **size + LR** — groups completed orders by size, averages `completedAt - intakeAt`. Cached per-session.

---

## The Narrator (LLM)

### Callable: `advisorNarrate`

Input:
```js
{
  tireId: string,
  mode: 'CLEARANCE' | 'PROFIT' | 'VELOCITY',
}
```

Server-side:
1. Read tire doc + derived signals + 7-day comps from `priceIntel/{size}`.
2. Check `advisorCache/{tireId}_{mode}` — return cached narrative if < 24h old.
3. Build the payload (shape in § "Payload" below).
4. Call Gemini Flash with the system prompt (§ "System prompt").
5. Parse response into `{ narrative, shadowFlag }`; write to cache; return.

### System prompt

```
You are a tire listing advisor for a northern Colorado commercial tire reseller.
Your job is to explain why a specific tire is ranked for listing right now, and
flag any contradictions the ranking math might have missed.

You will receive:
- Tire specs (brand, tread, size, load rating)
- Business mode: CLEARANCE | PROFIT | VELOCITY
- Days in inventory, days since last price change
- Gross margin at current price
- Velocity: avg days-to-sell for this size/LR (null if unknown)
- Cross-post status: listed on eBay / FB Marketplace / Craigslist, last listed date
- Recent comp prices for this size (last 7 days), if available
- kyleFrozen flag: when true, do not suggest re-pricing

Your output must be exactly two parts:

NARRATIVE (2–3 sentences max): Explain the top 2 signals driving this tire's
rank in plain English. Reference the active business mode. Be specific — name
the brand, size, and actual numbers.

SHADOW FLAG (conditional): Only emit this if ONE of these is true:
  1. Any comp price dropped >15% in the last 7 days for this size/brand
  2. Zero comps found (no market data = do not interpret as opportunity)
  If neither condition is true, output nothing for this section.
  Format: ⚠️ [one sentence, specific number, no speculation]

Do not suggest pricing changes. Do not recommend holding. Do not editorialize.
Output only NARRATIVE and SHADOW FLAG (if triggered). No headers, no bullets.
```

### Payload

```json
{
  "tire": {
    "brand": "Michelin",
    "tread": "Agilis CrossClimate",
    "size": "LT265/70R17",
    "lr": "E",
    "mspn": 12345,
    "price": 287.50,
    "fet": 18.40,
    "mountCost": 15.00,
    "deliveryCost": 8.00,
    "otherCost": 0,
    "margin": 94.10
  },
  "inventory": {
    "daysInStock": 112,
    "daysSincePriceChange": 44
  },
  "velocity": {
    "avgDaysToSell": 18,
    "sampleSize": 6,
    "confidence": "medium"
  },
  "crossPost": {
    "ebay": false,
    "fbMarketplace": true,
    "craigslist": false,
    "lastListedDate": "2026-03-01"
  },
  "comps": {
    "sevenDayAvg": 299.00,
    "sevenDayLow": 271.00,
    "sevenDayHigh": 319.00,
    "priceChangePct": -2.1,
    "source": "priceIntel"
  },
  "kyleFrozen": false,
  "mode": "CLEARANCE"
}
```

---

## UI

### Dashboard widget — `NextToPostSurface`

Replaces `HiddenGemsSurface`. Same card chrome, same 1-row + "Show more" modal pattern (keeps the Batch-5 UX we just shipped).

Header row inside the card:
- Eyebrow: "Next to Post"
- Trailing: a three-segment pill `[Clearance | Profit | Velocity]`. Active segment is amber-filled. Persists to `localStorage('skedaddle-advisor-mode-v1')`. Defaults to `VELOCITY`.

Top row shows rank #1:
- SKU + description
- Three small neutral chips for missing platforms (absorbed from Hidden Gems).
- 🔒 badge if `kyleFrozen`.
- "Post it" button on the right (opens ListingGenerator, same handoff HiddenGems used).

"Show more" opens the same modal chassis as HiddenGems, now showing the full ranked queue with:
- Checkbox per row (multi-select; action is "Open 1 listing" / "Open N listings" — sequential for v1, no bulk queue).
- Expand caret per row. On expand, the row calls `advisorNarrate` and shows narrative + optional shadow flag inline.

Empty state: `"Nothing to post. Everything cross-posted and recently priced."` via existing `EmptyState` compact variant.

### ListingGenerator advisor panel

New panel above the generated listing copy. Displays:
- Rank-score line: `"Rank #4 in Velocity mode · score 174"`
- Signal strip: `Age 44d · Velocity 18d avg · Margin 32% · Missing: eBay, CL`
- Narrative (LLM) + shadow flag (if any).
- 🔒 badge if `kyleFrozen`.

Panel collapses gracefully if the tire wasn't in the ranked set (e.g., `doNotList: true`) — shows "Not ranked (do-not-list)" or "Not ranked (no signals yet)".

### Tire detail drawer

Add a single checkbox: **"Do not list"** → writes `doNotList` to the tire doc. No UI for `kyleFrozen` (set by existing Kyle-price-confirm flow).

---

## eBay integration seam

The future eBay integration (#1) needs a payload shape. The advisor writes its generated listing output to `draftListings/{tireId}` in the shape eBay's Trading API expects:

```js
{
  sku: string,
  title: string,      // already generated
  description: string,
  priceCents: number,
  conditionId: '3000' | '5000',
  photos: string[],
  categoryId: '179680',   // LT passenger/light truck tires
  createdAt: Timestamp,
  source: 'advisor',
}
```

When eBay integration ships, "Post to eBay" just reads `draftListings/{tireId}` — no re-transformation. Non-eBay platforms continue to use the same `title` + `description` fields.

---

## Error handling

- `advisorNarrate` LLM failure → return the signal strip only; UI shows "Narrative unavailable (retry)."
- Missing velocity data → `sampleSize: 0`, `avgDaysToSell: null`; ranker contributes 0; LLM sees `null` and falls back to other signals per prompt.
- `priceIntel` missing comps → `comps: null`; prompt handles as "no market data" (triggers shadow flag).
- Firestore read errors → dashboard widget renders empty state + small "Data issue" pill (same pattern as TodayStrip).

---

## Testing

### Ranker — unit (Vitest, `src/utils/listingAdvisor/ranker.test.js`)
- Each mode produces the expected relative ordering for a crafted fixture of 6 tires.
- `doNotList: true` is filtered out before scoring.
- Unknown velocity contributes 0 (not NaN).
- `signalBreakdown` sums match `rankScore` within float tolerance.
- Empty input returns `[]`.

### Signals hook — unit (`src/hooks/useAdvisorSignals.test.js`)
- `daysSincePriceChange` computed from last `priceHistory` entry.
- `avgDaysToSell` groups by size+LR and filters out non-completed orders.
- Returns stable references when underlying data is unchanged (prevents ranker re-runs).

### NextToPostSurface — component (`src/components/dashboard/NextToPostSurface.test.jsx`)
- Mode toggle persists to localStorage and re-renders with new order.
- "Show more" modal opens; checkbox multi-select works; Escape closes.
- Expand row triggers `advisorNarrate` (mocked); narrative + shadow flag render.
- Empty state renders when ranked list is empty.

### Callable — integration (`functions/test/advisorNarrate.test.js`)
- Cache hit returns within 50ms without calling Gemini.
- Cache miss calls Gemini; response parsed into `narrative` + `shadowFlag`.
- Shadow flag is omitted from output if LLM returns empty for that section.

---

## File plan

**New:**
- `src/utils/listingAdvisor/ranker.js`
- `src/utils/listingAdvisor/ranker.test.js`
- `src/utils/listingAdvisor/modeWeights.js` (exported constant)
- `src/hooks/useAdvisorSignals.js`
- `src/hooks/useAdvisorSignals.test.js`
- `src/components/dashboard/NextToPostSurface.jsx` (replaces HiddenGemsSurface)
- `src/components/dashboard/NextToPostSurface.test.jsx`
- `src/components/tires/ListingAdvisorPanel.jsx` (used inside ListingGenerator)
- `functions/advisorNarrate.js` (callable)
- `functions/test/advisorNarrate.test.js`

**Modified:**
- `src/components/dashboard/Dashboard.jsx` — import NextToPostSurface instead of HiddenGemsSurface; pass advisor signals.
- `src/hooks/useDashboardSignals.js` — expose advisor-ranked list or delegate to `useAdvisorSignals`.
- `src/components/tires/ListingGenerator.jsx` — mount `<ListingAdvisorPanel>` at the top of the generated-listing view.
- `src/components/tires/TireDetailDrawer.jsx` (or equivalent) — add "Do not list" checkbox.
- `functions/index.js` — register `advisorNarrate` export.

**Deleted:**
- `src/components/dashboard/HiddenGemsSurface.jsx`
- `src/components/dashboard/HiddenGemsSurface.test.jsx`

---

## Rollout

1. Ship ranker + signals hook + NextToPostSurface behind a feature flag (`flags.listingAdvisor`), defaulting on in dev, off in prod.
2. Verify rank ordering with Alex against gut feel on ~20 tires across all three modes.
3. Enable in prod; delete HiddenGemsSurface files.
4. Add ListingAdvisorPanel to ListingGenerator.
5. Watch Gemini Flash cost for one week. If < $5, leave uncached TTL at 24h; if higher, bump to 7d.

## v2 backlog (explicitly not in v1)

- Signal sparklines on each row.
- Nightly Cloud Function writes `rankScore` to each tire doc for instant sorted table loads.
- Velocity bootstrap by size class for unknowns.
- Batch listing queue ("Open 5" generates sequentially with progress).
- Platform-specific tone variants (eBay structured vs. FB conversational).
- Global mode toggle (promote from widget-local to user-setting).
