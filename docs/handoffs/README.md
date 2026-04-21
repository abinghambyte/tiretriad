# docs/handoffs

Active Cursor agent handoff briefs. Each brief is a self-contained patch
spec that a Cursor agent can pick up cold, implement, validate, and open
a PR from - then stop.

## Active rollout - batch 4 (2026-04-20)

Dashboard polish + margin-queue + unutilized inventory + crew widget +
My Queue. Five briefs dispatched in parallel where dependencies allow.

| Patch | Branch | Scope |
| --- | --- | --- |
| P `payout-panel-polish` | `payout-panel-polish` | Live Buy/Qty/Retail ledger preview in `PayoutConfigPanel.jsx`; frontend-only |
| Q `margin-queue-backend` | `margin-queue-backend` | `functions/researchQueue.js` + scheduled nightly sweep + `enqueueToResearch` / `resolveQueueItem` callables; removes red margin row from dashboard; adds `kylesQueueCount` signal; schema additions (`marginFloor`, `researchQueue`, `marginConfirmed`) + backfill script |
| Qa `unutilized-inventory-backend` | `unutilized-inventory-backend` | `src/utils/unutilizedClassifier.js` + `src/hooks/useUnutilizedSignals.js`; classifier uses `computeOpportunityScore` x `platformListings`; eBay excluded with an inline comment until the integration ships |
| R `crew-widget-backend` | `crew-widget-backend` | `functions/presence.js` (rate-limited heartbeat) + `src/lib/presenceHeartbeat.js` + `crewSignals` map on `useDashboardSignals`; no visual change in this patch |
| S `my-queue-page` | `my-queue-page` | `/my-queue` page (sourcer/admin), `QueueRow`, Analytics `verification-queue` + `margin-archive` tabs (admin-only). Depends on Q. |

Merge coordination:

- P, Q, Qa, R are orthogonal at the file level and can land in any order.
- Q and R both edit `src/hooks/useDashboardSignals.js` at different
  sections. Q removes `lowMargin` / adds `kylesQueueCount`; R adds a
  separate `crewSignals` map. Prefer merging Q first; if R lands first
  the Q author rebases and keeps both additions.
- S must be cut after Q merges - it reads the fields and callables Q
  introduces.
- Three Cloud Function deploys + one Firestore-rules deploy across the
  batch. Each brief's PR body lists the exact deploy line.

## Conventions

- One file per patch: `patch-<letter>-<short-name>.md`.
- First line of each brief is the H1 title (no em dashes anywhere).
- Brief body covers: branch name, scope (files touched), tasks,
  out-of-scope, validation commands, PR title.
- Briefs end with the dispatch line:
  `Execute this brief exactly. Branch from main, run all validation
  commands before opening the PR, and stop after the PR is open.`
- When a rollout bundles multiple patches, the README should carry the
  branch / file ownership map and any merge-coordination notes for that
  rollout.
- Delete a brief once its PR merges. Keep the folder as narrow as
  possible so an agent opening it sees only active work.

## Last rollout

April 20, 2026 - batch 3. Five patches shipped in parallel. All merged.

| Patch | Scope | PR |
| --- | --- | --- |
| K `payout-config` | `meta/payoutConfig` doc + admin Payouts & Taxes panel at `/ops`, buy-side taxes folded into costTotal | #74 |
| L `fet-tag` | `hasFet` tag on tires + MarginTable render fix + backfill script | #72 |
| M `tire-haystack-v2` | Description-search normalizer: sidewall codes, load range, speed rating | #71 |
| N `dispatch-kill` | Remove permanent `/dispatch` placeholder route + `DispatchRedirect.jsx` | #70 |
| O `vip-magic-link-v1` | Signed VIP magic links + public `/vip/:token` route + branded Sinch shell | #73 |

## Previous rollout

April 20, 2026 - batch 2. Three small patches shipped in parallel. All merged.

| Patch | Scope | PR |
| --- | --- | --- |
| H `sinch-lead-drawer` | CRM Leads source pill + inquiry preview + detail drawer | #69 |
| I `revenue-stats-backfill` | One-off script to rebuild `meta/revenueStats` | #67 |
| J `backdate-log-sale` | Optional backdated completion timestamp on Log Sale | #68 |
