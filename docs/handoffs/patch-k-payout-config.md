# Patch K - Payout config doc + buy-side taxes + admin panel

You are a Cursor agent shipping ONE patch from a parallel rollout. Two other patches (L, M) are in flight concurrently. Do not touch any file outside the scope below. See `docs/handoffs/README.md` for the full ownership map if needed.

## Goal

Move the profit-sharing split and the buy-side tax rates out of hardcoded constants into a single Firestore config doc (`meta/payoutConfig`), add an admin-only settings panel on `/ops` to edit them, and change the active split to 35 / 35 / 30 (Tanner is being removed entirely). Apply the taxes to `costTotal` at completion so the pool everyone splits is net of taxes.

## Branch

`payout-config` (cut from latest `main`).

## Context

- Current hardcoded split lives at `functions/financeStats.js` line 11-12: `CREW_KEYS = ['alex', 'dj', 'tanner', 'kyle']` and `CREW_SPLIT = { alex: 0.5, dj: 0.2, tanner: 0.2, kyle: 0.1 }`. Tanner was a silent partner. The new split is Alex 0.35 / DJ 0.35 / Kyle 0.30, no Tanner.
- Current cost model at `functions/financeStats.js` line 246-251: `costTotal = (buy + cts) * qty`, `marginTotal = pay - costTotal`, `pool = marginTotal`. FET on the tire doc is intentionally excluded from margin math. Taxes are NOT currently subtracted.
- Split display appears in three Slack paths that all need to read the same config: `functions/financeSlackCommands.js` line 138, `functions/lookupUtilitySlackCommands.js` lines 425 and 469.
- `bumpCrewEarned` at `functions/financeStats.js` line 213 folds the pool into `meta/crewEarnings` member balances.
- Admin settings hub is `/src/pages/OpsPage.jsx`. Existing sections: expense tracker, tax-prep export, reorder queue. New panel slots in after the tax-prep export.
- `meta/crewEarnings` may already contain a `tanner` member balance from historical pool bumps. Leave that field alone - no retroactive zero-out, no UI hiding, no migration. It simply stops growing.

## Scope (only touch these files)

- `functions/financeStats.js` - read config, apply split from config, add tax to cost
- `functions/financeSlackCommands.js` - read split from config for `/spoils` output
- `functions/lookupUtilitySlackCommands.js` - read split from config for lookup + simulation lines
- `functions/financeStats.test.mjs` - update for new split, add tax-in-cost cases
- NEW: `functions/payoutConfig.js` - loader with hardcoded fallback, tiny pure helper module
- NEW: `functions/payoutConfig.test.mjs` - fallback + validation cases
- `src/pages/OpsPage.jsx` - add "Payouts & Taxes" admin section
- NEW: `src/components/ops/PayoutConfigPanel.jsx` - the panel component
- NEW: `src/components/ops/PayoutConfigPanel.test.jsx` - render + submit test

Do not touch anything else. In particular: do not touch `src/utils/orderPoolMargin.js`, `src/utils/marginCalc.js`, `src/utils/crewEarningsLabels.js`, the Tires table, or the Sale Messenger.

## Tasks

### 1. New config loader - `functions/payoutConfig.js`

Export:

```js
const DEFAULT_CONFIG = Object.freeze({
  splits: { alex: 0.35, dj: 0.35, kyle: 0.30 },
  taxes: {
    countyTaxPct: 0.0109,
    localTaxPct: 0.0312,
    stateTaxPct: 0.0302,
    tireFeePerTire: 2.00,
  },
})

async function loadPayoutConfig(db) { /* read meta/payoutConfig, fall back to DEFAULT_CONFIG */ }
function validatePayoutConfig(input) { /* pure validator, returns { ok, errors, normalized } */ }
function computeOrderTaxes(buyPerTire, qty, taxes) { /* returns { salesTax, tireFee, total } */ }
function splitPool(pool, splits) { /* returns { alex, dj, kyle } keyed earnings */ }
```

Rules for `validatePayoutConfig`:
- `splits` must be an object with exactly the keys `alex`, `dj`, `kyle`, all finite numbers in `[0, 1]`, summing to `1 +/- 1e-6`.
- Each tax percentage must be a finite number in `[0, 0.25]` (sanity ceiling so a fat-finger can't set 300%).
- `tireFeePerTire` must be finite and in `[0, 25]`.
- Return `{ ok: false, errors: [...] }` on any violation so the Cloud Function can throw `HttpsError('invalid-argument', errors.join('; '))` and the admin UI can render them inline.

### 2. Backend wiring - `functions/financeStats.js`

- Remove the hardcoded `CREW_SPLIT` object. Keep `CREW_KEYS` exported but change its value to `['alex', 'dj', 'kyle']` (Tanner out). Delete the `crewSlackSplitDisplayName` and `crewEarningsMetaDisplayName` Tanner branches; keep the functions but simplify them to just return the raw key.
- `runCompletionTransaction`: before the pool calc, call `loadPayoutConfig(db)`. Compute `taxes = computeOrderTaxes(buy, qty, config.taxes)`, then `costTotal = round2((buy + cts) * qty + taxes.total)`. `marginTotal` and `pool` are unchanged math: `pay - costTotal`.
- Store `taxesTotal` on the completion patch under a new field `taxesApplied` (object with `salesTax`, `tireFee`, `total`) so the order doc has an audit trail of what rates fired.
- `bumpCrewEarned`: take `splits` as a second argument, default to `DEFAULT_CONFIG.splits`. Loop `Object.keys(splits)` instead of the old `CREW_KEYS` constant.

### 3. Slack readers

- `financeSlackCommands.js` line 138 (`/spoils`) and `lookupUtilitySlackCommands.js` lines 425 + 469: each path should `await loadPayoutConfig(db)` once at handler entry, then format the active split from `config.splits` instead of the old constant. Display should list the three active participants - no Tanner row.

### 4. Completion-callable exposure (optional, but do it)

Add a callable `getPayoutConfig` to whichever functions index already exports admin-only callables (look in `functions/index.js` for the existing grouping; if there is no admin-callables module, add it alongside the other ops-scoped exports). This callable returns the current config so the admin UI can render without a second Firestore client read. Also add `updatePayoutConfig(data)` that runs `validatePayoutConfig`, writes `meta/payoutConfig` with `{ ...normalized, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid }`, and returns the saved doc.

Gate both callables on `request.auth.token.role === 'admin'`; throw `permission-denied` otherwise. Reference existing admin-only callables in the repo for the pattern.

### 5. Admin panel - `src/components/ops/PayoutConfigPanel.jsx`

- Fetch current config via the `getPayoutConfig` callable on mount. Show a loading skeleton while in flight.
- Split section: three number inputs (Alex / DJ / Kyle), rendered as percentages (display `35.0` for `0.35`, normalize on submit). Show the live sum next to the fields - if it is not 100% (+/- 0.0001) the submit button is disabled with a small "must total 100%" note.
- Taxes section: four number inputs (County %, Local %, State %, Tire fee $/tire). Show a worked example below them: "For a buy cost of $100/tire x 4 tires, taxes add $X.XX (sales tax $Y.YY + tire fee $Z.ZZ)". Recompute on every keystroke.
- Submit button calls `updatePayoutConfig`. On success: toast "Payout config saved." On validation error: render the server error message inline.
- Style: match the card rhythm of the existing Ops sections (dark card, section title, subtle description line, same button styling). Reference the expense-tracker and tax-prep-export blocks for the look.
- No diff/audit UI in this patch. Just the editable form.

### 6. OpsPage wiring

- Import `PayoutConfigPanel` and render it after the tax-prep export block and before the reorder queue.
- Section heading: "Payouts & Taxes". Description line: "Pool split and buy-side tax rates applied at order completion. Changes take effect on the next completion - historical orders are not recomputed."

### 7. Tests

- `functions/payoutConfig.test.mjs`: fallback returns defaults when doc missing; validator rejects bad splits (sum != 1, missing key, negative, > 1); validator rejects out-of-range tax rates; `computeOrderTaxes` returns correct totals for a known input; `splitPool` distributes exactly with no rounding loss for a $100.00 pool under the 35/35/30 split.
- `functions/financeStats.test.mjs`: update existing split assertions to the new default; add a case covering `taxesApplied` appearing on the completion patch and `costTotal` reflecting taxes.
- `src/components/ops/PayoutConfigPanel.test.jsx`: renders with a mocked current config, disables submit when splits do not sum to 100%, calls the update callable on submit.

## Historical data

Do not retroactively recompute `meta/revenueStats` or `meta/crewEarnings`. Patch I already shipped a separate backfill for revenueStats; neither of those rollups gets re-run here. Existing `tanner` balance in `meta/crewEarnings` stays untouched - the CREW_KEYS narrowing just means no new bumps land on that field.

## Out of scope

- Retrofitting orders completed before this change to record `taxesApplied`.
- UI to view / edit individual crew earnings balances.
- Removing the legacy `tanner` member from `meta/crewEarnings`.
- Per-jurisdiction tax presets / multiple tax profiles. One active config doc only.
- An audit-log collection of config changes (use the `updatedAt` / `updatedBy` fields; formal audit is a follow-up).
- FET as a configurable field (covered by Patch L).
- Frontend-facing split display (only Slack + the admin panel read the config in this patch).

## Validation (must all pass before PR)

```
./node_modules/.bin/vitest run
./node_modules/.bin/eslint functions/financeStats.js functions/financeSlackCommands.js functions/lookupUtilitySlackCommands.js functions/payoutConfig.js functions/payoutConfig.test.mjs src/pages/OpsPage.jsx src/components/ops/
./node_modules/.bin/vite build
```

## PR

- Title: `Payouts & Taxes: config doc + /ops admin panel + buy-side tax in cost`
- Body: short summary + Test plan. Include a "Migration note" line making explicit that historical orders are not recomputed and the legacy `tanner` balance in `meta/crewEarnings` is left as-is. No Claude trailers, no em dashes in published text.

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
