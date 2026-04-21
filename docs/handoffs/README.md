# docs/handoffs

Active Cursor agent handoff briefs. Each brief is a self-contained patch
spec that a Cursor agent can pick up cold, implement, validate, and open
a PR from - then stop.

## Active rollout - batch 4 tail (2026-04-21)

Four briefs (P, Q, Qa, R) landed as a single consolidated PR after a
Cursor file-watcher race caused the crew-widget commit to absorb shared
margin-queue edits mid-dispatch. See Last rollout for the PR link. Only
Patch S remains; it depends on the consolidated PR merging first.

| Patch | Branch | Scope |
| --- | --- | --- |
| S `my-queue-page` | `my-queue-page` | `/my-queue` page (sourcer/admin), `QueueRow`, Analytics `verification-queue` + `margin-archive` tabs (admin-only). Depends on the batch-4 consolidated PR. |

## Conventions

- One file per patch: `patch-<letter>-<short-name>.md`.
- Every brief starts with a YAML frontmatter block (see schema below),
  then a blank line, then the H1 title (no em dashes anywhere).
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

## Frontmatter schema (required)

Every `patch-*.md` opens with YAML frontmatter. The `dispatch-handoffs`
skill parses this as data; prose inference is explicitly disallowed, so
malformed or missing frontmatter halts dispatch loudly.

```yaml
---
id: Q                             # patch letter (matches filename)
title: Margin floor queue backend # short human-readable title
branch: margin-queue-backend      # exact branch name the Cursor agent will create
depends_on: []                    # list of patch ids that must merge first; [] if none
touches_shared:                   # files also edited by OTHER patches in the same batch
  - src/hooks/useDashboardSignals.js
frontend_only: false              # true iff the brief touches zero backend state
deploy:                           # required unless frontend_only: true
  functions:
    - enqueueBelowMarginFloor
    - enqueueToResearch
    - resolveQueueItem
  firestore_rules: true           # true iff firestore.rules is edited
  scripts:                        # post-merge one-offs; empty list ok
    - scripts/backfill-margin-floor.mjs --dry-run
    - scripts/backfill-margin-floor.mjs --confirm
---
```

Required fields: `id`, `title`, `branch`, `depends_on`, `touches_shared`,
and EITHER `frontend_only: true` OR a non-empty `deploy` block. A brief
with neither a `deploy` block nor `frontend_only: true` is invalid and
halts dispatch.

## Last rollout

April 21, 2026 - batch 4. Four briefs consolidated into one PR after a
Cursor file-watcher race blended shared-file edits across the Q and R
commits. Content matches each brief's acceptance criteria.

| Patch | Scope | PR |
| --- | --- | --- |
| P `payout-panel-polish` | Live Buy/Qty/Retail ledger preview in `PayoutConfigPanel.jsx` | see consolidated PR |
| Q `margin-queue-backend` | `functions/researchQueue.js` + scheduled nightly sweep + `enqueueToResearch` / `resolveQueueItem` callables; replaces red margin row with `kylesQueueCount` signal | see consolidated PR |
| Qa `unutilized-inventory-backend` | `unutilizedClassifier` + `useUnutilizedSignals` hook; eBay deferred to the sell-side integration | see consolidated PR |
| R `crew-widget-backend` | `updatePresence` callable + heartbeat client + `crewSignals` map on `useDashboardSignals` | see consolidated PR |

## Previous rollout

April 20, 2026 - batch 3. Five patches shipped in parallel. All merged.

| Patch | Scope | PR |
| --- | --- | --- |
| K `payout-config` | `meta/payoutConfig` doc + admin Payouts & Taxes panel at `/ops`, buy-side taxes folded into costTotal | #74 |
| L `fet-tag` | `hasFet` tag on tires + MarginTable render fix + backfill script | #72 |
| M `tire-haystack-v2` | Description-search normalizer: sidewall codes, load range, speed rating | #71 |
| N `dispatch-kill` | Remove permanent `/dispatch` placeholder route + `DispatchRedirect.jsx` | #70 |
| O `vip-magic-link-v1` | Signed VIP magic links + public `/vip/:token` route + branded Sinch shell | #73 |
