# Patch Qa: Unutilized inventory classifier + selector hook

Branch: `unutilized-inventory-backend`

Scope (files touched):

- `src/utils/unutilizedClassifier.js` - NEW. Pure function `isUnutilized(tire)` + helper `unutilizedReasons(tire)` for row-level copy.
- `src/utils/unutilizedClassifier.test.js` - NEW. Vitest. Covers all filter dimensions in isolation + combined.
- `src/hooks/useUnutilizedSignals.js` - NEW. Live Firestore-backed selector returning `{ rows, footerCounts, loading, error }`.
- `src/hooks/useUnutilizedSignals.test.js` - NEW. Unit-test the ranking + footer derivation using in-memory fixtures (no Firestore mock needed; the hook's pure derivation can be factored into a sibling `deriveUnutilizedSignals(tires)` fn so the test has no Firebase dependency).
- No backend / Cloud Function / Firestore rules changes. No UI changes (Patch Qa is purely the data layer; the Dashboard surface that consumes this hook is a follow-on UI patch not bundled here).

## Classifier spec

`isUnutilized(tire)` returns true when ALL of the following hold:

1. `computeOpportunityScore(tire).opportunity > 0`
2. `computeOpportunityScore(tire).confidence` is `'high'` or `'medium'`. Low-confidence tires are excluded so the surface stays actionable.
3. For every platform in `PLATFORMS` (see below), `listingStatus(tire, platform)` is not `'active'`. A single active listing anywhere means the tire is already being marketed; it drops off.
4. `tire.researchQueue == null` OR `tire.researchQueue.resolvedAt != null`. An open queue entry (regardless of reason) means Kyle is already on it.
5. `tire.marginConfirmed !== true`. Terminal archived tires never resurface here.

`PLATFORMS` is a module-level constant: `['facebook', 'offerup', 'craigslist']`. Include this code comment exactly:

```
// eBay is intentionally NOT in PLATFORMS until the sell-side integration ships
// (see ROADMAP.md > "eBay sell-side API integration"). When it lands, add
// 'ebay' here and no other change is required.
```

`unutilizedReasons(tire)` returns an array of short tag strings describing WHY a tire is flagged - e.g. `['high opportunity', 'never listed']` or `['medium opportunity', '2 stale']`. Used by the row UI (future patch) to show a quiet justification pill cluster. Keep the returned strings lowercase and under 20 chars each. This fn may assume `isUnutilized(tire) === true` (do not defensively re-check).

## Selector hook spec

`useUnutilizedSignals()` returns:

```
{
  rows: Array<{ tire, score, reasons }>,  // sorted by score.opportunity desc, capped at 25
  footerCounts: {
    inResearchThisWeek: number,  // tires with researchQueue.at within last 7 days, any reason
    listedThisWeek: number,      // tires with ANY platformListings[*].lastPostedAt within last 7 days
  },
  loading: boolean,
  error: Error | null,
}
```

Factor the derivation into a pure sibling:

```
export function deriveUnutilizedSignals(tires, now = Date.now()) { ... }
```

so tests can drive it with fixtures. The hook wires the Firestore tires collection snapshot into this derivation.

Query strategy: subscribe to the full tires collection (same pattern other dashboard hooks use) and filter client-side. If the collection grows large enough that this gets expensive, optimize later - out of scope for v1.

## Tasks

1. Implement `unutilizedClassifier.js` with `PLATFORMS`, `isUnutilized`, `unutilizedReasons`. Include the eBay code comment verbatim.
2. Implement `deriveUnutilizedSignals(tires, now)` and `useUnutilizedSignals()` in `useUnutilizedSignals.js`.
3. Write Vitest suites for both modules. Fixtures: at least one tire per exclusion dimension (low confidence, opportunity <= 0, active listing on each platform individually, open research queue, marginConfirmed true) plus one that qualifies. Verify the qualifying tire appears in `rows` and every excluded tire does not.
4. No Dashboard changes in this patch. Do not import the hook into Dashboard.jsx yet - the UI wiring is a separate follow-on so the visual patch can be designed against a stable data contract.

## Out of scope

- The Unutilized Inventory UI section (renders the rows). Separate follow-on patch.
- Row-level `List Now` / `Research` button wiring (UI patch).
- eBay inclusion (gated on the eBay integration patch in ROADMAP).
- Any Firestore schema change; this patch reads fields that Patch Q introduces.
- Any change to `computeOpportunityScore` or `listingStatus`.

## Validation

```
npm run lint
npm run test -- unutilizedClassifier
npm run test -- useUnutilizedSignals
npm run build
```

All must pass.

## PR title

`Unutilized inventory: classifier + selector hook`

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
