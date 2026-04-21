---
id: P
title: Payout panel polish
branch: payout-panel-polish
depends_on: []
touches_shared: []
frontend_only: true
---

# Patch P: Payout panel polish

Branch: `payout-panel-polish`

Scope (files touched):

- `src/components/ops/PayoutConfigPanel.jsx` - UI polish (Buy/Qty/Retail inputs, live ledger preview, save-button wiring feedback)
- `src/components/ops/PayoutConfigPanel.test.jsx` - NEW (Vitest + Testing Library; preview recalculates on input change, save button disables on invalid split sum, live ledger renders split dollars)
- No backend changes. `functions/payoutConfig.js` is already correct.

## Tasks

1. Replace the hard-coded "For a buy cost of $100/tire x 4 tires" example paragraph with three user-editable inputs side-by-side:
   - `Buy cost per tire ($)` - default `100.00`
   - `Quantity` - default `4`
   - `Retail per tire ($)` - default blank; when blank, the retail-side ledger columns render `-`. When set, the ledger includes the computed pool split.
   All three inputs use the same zinc-950 bg / border styling as the other inputs in the panel.

2. Render a ledger table immediately below the inputs with these rows:
   - `Buy subtotal` (= buy x qty)
   - `County tax` (= buy subtotal x countyTaxPct)
   - `Local tax` (= buy subtotal x localTaxPct)
   - `State tax` (= buy subtotal x stateTaxPct)
   - `Tire fee` (= tireFeePerTire x qty)
   - `Cost total` (= buy subtotal + county + local + state + tire fee)
   - If retail is set: `Retail subtotal`, `Pool (retail - cost)`, then one row per split member (Alex / DJ / Kyle) showing their dollar share using the current in-form split percentages.
   Use `formatCurrency` from `src/utils/format.js` for all dollar columns. Right-align the value column; use `font-variant-numeric: tabular-nums` on the whole table so digits line up.

3. Keep the existing split inputs and tax inputs. The live ledger recomputes as any input changes.

4. The save button stays at the bottom and keeps its existing `splitOk` gate. Add a short helper line right above the save button: `Preview uses the values in the form; saving writes them to meta/payoutConfig.` Rationale: set expectations so the owner knows preview != saved.

5. If the `updatePayoutConfig` callable errors, surface the HttpsError message verbatim in the existing `serverError` pane (the component already has this; verify it still works after the restyling).

6. Do not change the callable signature. Do not move helpers out of the component. The existing `pctToFraction` / `fractionToPctInput` helpers stay in-file.

## Out of scope

- Any change to `functions/payoutConfig.js`.
- Saving the Buy/Qty/Retail preview values to Firestore - they are ephemeral, client-side only.
- Historical order recomputation (explicit non-goal; already called out in the panel subtitle).
- Any other ops-page change.

## Validation

Run these from the repo root before opening the PR:

```
npm run lint
npm run test -- PayoutConfigPanel
npm run build
```

All three must pass.

## PR title

`Payout config: live Buy/Qty/Retail ledger preview`

## PR body note (important)

Include this paragraph in the PR description so future mergers know the backend half already shipped:

> Frontend-only change. The `getPayoutConfig` and `updatePayoutConfig` callables shipped with PR #74 and are already deployed; this PR just makes the owner-facing preview accurate and the ledger legible. If "Save" ever appears to do nothing on a fresh clone, the fix is `firebase deploy --only functions` - Vercel auto-deploys the frontend from main but Cloud Functions remain a manual step.

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
