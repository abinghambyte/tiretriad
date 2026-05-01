# DJ delivery share-bump (v1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crew member who delivered an order gets a configurable bump to their share. Today's bundled-split model; zero-sum redistribution; 7-day admin edit window; audit log.

**Architecture:** Pure helper `applyDeliveryBump` in `functions/payoutConfig.js`. `completeOrder` + new `editOrderDeliveredBy` callable both write the field, snapshot the bump-at-completion, and write a `bumpAudit` subcollection doc. `bumpCrewEarned` consumes the adjusted splits and tracks per-member running totals. Slack close-out message gains 3 buttons; web close-out modal gains a radio. `/spoils` output gets an inline subline.

**Tech Stack:** Firebase Functions (Node 22), Firestore, Slack Block Kit, React 19 + Vitest on the web side.

**Spec:** `docs/superpowers/specs/2026-05-01-dj-delivery-bump-design.md`

**Worktree:** `.claude/worktrees/dj-delivery-bump` (branch `dj-delivery-bump`)

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `functions/payoutConfig.js` | Modify | Add `applyDeliveryBump` helper; extend `validatePayoutConfig`; bump `DEFAULT_CONFIG` |
| `functions/payoutConfig.test.mjs` | Modify | New tests for the helper + validator |
| `functions/orders.js` | Modify | `completeOrder` accepts `deliveredBy`; writes order fields + `deliveryBumpAtCompletion`; writes initial `bumpAudit` |
| `functions/orders.test.mjs` (or `.test.js`) | Modify | Tests for the new acceptance + validation paths |
| `functions/financeStats.js` | Modify | `bumpCrewEarned` uses adjusted splits; tracks `totalDeliveryBumps` + `deliveryBumpCount` |
| `functions/financeStats.test.mjs` | Modify | New tests for the bumped-pool path |
| `functions/orderDeliveredByEdit.js` | Create | New `editOrderDeliveredBy` callable |
| `functions/orderDeliveredByEdit.test.mjs` | Create | Callable tests |
| `functions/index.js` | Modify | Register `editOrderDeliveredBy` export |
| `functions/financeSlackCommands.js` | Modify | `/spoils` per-member subline when bump count > 0 |
| `functions/financeSlackCommands.test.mjs` | Modify | Tests |
| `functions/slackInteractivityCompletion.js` (or wherever the close-out interactivity lives) | Modify | New "Delivered by ..." buttons + handler |
| `src/components/tires/SaleMessenger.jsx` | Modify | "Who delivered?" radio when fulfillment = Delivery |
| `src/components/tires/SaleMessenger.test.jsx` (if exists) | Modify | Tests |
| `src/components/admin/payout/EditDeliveredByButton.jsx` | Create | Admin edit button + modal |
| `src/components/admin/payout/EditDeliveredByButton.test.jsx` | Create | Tests |
| `src/components/admin/payout/PayoutConfigPanel.jsx` | Modify | Add `deliveryBump` field |

---

## Task 1: `applyDeliveryBump` + `validatePayoutConfig` extension

**Files:**
- Modify: `functions/payoutConfig.js`
- Modify: `functions/payoutConfig.test.mjs` (or create if missing)

- [ ] **Step 1: Write the failing tests**

If `functions/payoutConfig.test.mjs` doesn't exist, create it. Otherwise append. Add:

```js
import { describe, expect, it } from 'vitest'
import {
  validatePayoutConfig,
  applyDeliveryBump,
  DEFAULT_CONFIG,
} from './payoutConfig.js'

describe('applyDeliveryBump', () => {
  const splits = { alex: 0.35, dj: 0.35, kyle: 0.30 }

  it('returns splits unchanged when deliveredBy is null', () => {
    expect(applyDeliveryBump(splits, 0.05, null)).toEqual(splits)
  })

  it('returns splits unchanged when bump is 0', () => {
    expect(applyDeliveryBump(splits, 0, 'dj')).toEqual(splits)
  })

  it('returns splits unchanged when deliveredBy is unknown', () => {
    expect(applyDeliveryBump(splits, 0.05, 'mallory')).toEqual(splits)
  })

  it('zero-sum redistributes a 5% bump on dj', () => {
    const out = applyDeliveryBump(splits, 0.05, 'dj')
    expect(out.dj).toBeCloseTo(0.40, 6)
    expect(out.alex + out.dj + out.kyle).toBeCloseTo(1.0, 6)
    // alex/kyle scale proportionally
    expect(out.alex).toBeCloseTo(0.35 * (0.60 / 0.65), 4)
    expect(out.kyle).toBeCloseTo(0.30 * (0.60 / 0.65), 4)
  })

  it('clamps deliverer share to 0.95 when bump would exceed 1.0', () => {
    const out = applyDeliveryBump(splits, 0.99, 'dj')
    expect(out.dj).toBe(0.95)
    expect(out.alex + out.dj + out.kyle).toBeCloseTo(1.0, 6)
  })

  it('preserves sum-to-1 with negative bump (defensive; clamps to 0)', () => {
    const out = applyDeliveryBump(splits, -0.10, 'dj')
    expect(out).toEqual(splits)
  })
})

describe('validatePayoutConfig — deliveryBump', () => {
  const baseTaxes = {
    countyTaxPct: 0.01, localTaxPct: 0.03, stateTaxPct: 0.03, tireFeePerTire: 2,
  }
  const baseSplits = { alex: 0.35, dj: 0.35, kyle: 0.30 }

  it('accepts deliveryBump in valid range', () => {
    const r = validatePayoutConfig({ splits: baseSplits, taxes: baseTaxes, deliveryBump: 0.05 })
    expect(r.ok).toBe(true)
    expect(r.normalized.deliveryBump).toBe(0.05)
  })

  it('defaults deliveryBump to 0.05 when missing', () => {
    const r = validatePayoutConfig({ splits: baseSplits, taxes: baseTaxes })
    expect(r.ok).toBe(true)
    expect(r.normalized.deliveryBump).toBe(0.05)
  })

  it('rejects deliveryBump below 0', () => {
    const r = validatePayoutConfig({ splits: baseSplits, taxes: baseTaxes, deliveryBump: -0.05 })
    expect(r.ok).toBe(false)
  })

  it('rejects deliveryBump above 0.5', () => {
    const r = validatePayoutConfig({ splits: baseSplits, taxes: baseTaxes, deliveryBump: 0.6 })
    expect(r.ok).toBe(false)
  })
})

describe('DEFAULT_CONFIG', () => {
  it('exposes deliveryBump default', () => {
    expect(DEFAULT_CONFIG.deliveryBump).toBe(0.05)
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

`cd .claude/worktrees/dj-delivery-bump && npx vitest run functions/payoutConfig.test.mjs`

Expected: failures (helper missing, validator rejects deliveryBump as unknown, default missing).

- [ ] **Step 3: Extend `payoutConfig.js`**

In `functions/payoutConfig.js`:

3a. Bump `DEFAULT_CONFIG`:

```js
const DEFAULT_CONFIG = Object.freeze({
  splits: Object.freeze({ alex: 0.35, dj: 0.35, kyle: 0.3 }),
  taxes: Object.freeze({
    countyTaxPct: 0.0109,
    localTaxPct: 0.0312,
    stateTaxPct: 0.0302,
    tireFeePerTire: 2.0,
  }),
  deliveryBump: 0.05,
})
```

3b. Add the `applyDeliveryBump` pure helper near `splitPool`:

```js
const SPLIT_KEYS = ['alex', 'dj', 'kyle']

/**
 * Compute adjusted splits with the deliverer's share bumped, others
 * scaled proportionally. Total stays sum-to-1.
 *
 * Returns the input splits unchanged when:
 *   - deliveredBy is null / undefined
 *   - deliveredBy isn't one of SPLIT_KEYS
 *   - deliveryBump is 0 or non-finite
 *   - deliveryBump is negative (defensive)
 *
 * Clamps the deliverer's adjusted share to 0.95 to prevent edge cases
 * where bump >= remainder would zero out the others.
 *
 * @param {Record<string, number>} splits  e.g. { alex: 0.35, dj: 0.35, kyle: 0.30 }
 * @param {number} deliveryBump            e.g. 0.05
 * @param {string | null} deliveredBy      'alex' | 'dj' | 'kyle' | null
 * @returns {Record<string, number>}
 */
function applyDeliveryBump(splits, deliveryBump, deliveredBy) {
  if (!deliveredBy || !SPLIT_KEYS.includes(deliveredBy)) return { ...splits }
  const bump = Number(deliveryBump)
  if (!Number.isFinite(bump) || bump <= 0) return { ...splits }
  const base = Number(splits?.[deliveredBy]) || 0
  const newDeliverer = Math.min(0.95, base + bump)
  const remaining = Math.max(0, 1 - newDeliverer)
  // Scale the other keys proportionally to fill `remaining`.
  const others = SPLIT_KEYS.filter((k) => k !== deliveredBy)
  const oldOthersTotal = others.reduce((acc, k) => acc + (Number(splits?.[k]) || 0), 0)
  const out = { [deliveredBy]: newDeliverer }
  if (oldOthersTotal === 0) {
    // Defensive: give deliverer everything if others were already 0.
    return { [deliveredBy]: 1, ...Object.fromEntries(others.map((k) => [k, 0])) }
  }
  for (const k of others) {
    out[k] = (Number(splits?.[k]) || 0) * (remaining / oldOthersTotal)
  }
  return out
}
```

3c. Extend `validatePayoutConfig` to accept `deliveryBump`:

Find the existing validator. Add a clause for `deliveryBump` after the taxes validation. Pseudocode:

```js
const bumpRaw = src.deliveryBump
let deliveryBump = 0.05
if (bumpRaw === undefined || bumpRaw === null) {
  // default
} else {
  const v = Number(bumpRaw)
  if (!Number.isFinite(v)) errors.push('deliveryBump must be a finite number')
  else if (v < 0 || v > 0.5) errors.push('deliveryBump must be in [0, 0.5]')
  else deliveryBump = v
}

// In the normalized output:
const normalized = {
  splits: { ... },
  taxes: { ... },
  deliveryBump,
}
```

3d. Export the helper:

```js
module.exports = {
  DEFAULT_CONFIG,
  PAYOUT_CONFIG_REF,
  loadPayoutConfig,
  validatePayoutConfig,
  computeOrderTaxes,
  splitPool,
  applyDeliveryBump,   // NEW
  round2,
  getPayoutConfig,
  updatePayoutConfig,
}
```

- [ ] **Step 4: Run tests to verify pass**

`cd .claude/worktrees/dj-delivery-bump && npx vitest run functions/payoutConfig.test.mjs`

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
cd .claude/worktrees/dj-delivery-bump
git add functions/payoutConfig.js functions/payoutConfig.test.mjs
git commit -m "feat(payout): applyDeliveryBump helper + deliveryBump config field

DEFAULT_CONFIG.deliveryBump defaults to 0.05. validatePayoutConfig
accepts the field with [0, 0.5] range. Pure helper applyDeliveryBump
zero-sum redistributes by bumping the deliverer's share and scaling
the others proportionally so splits stay sum-to-1. Defensive clamp at
0.95 prevents edge cases where bump >= remainder would zero others.

Spec: docs/superpowers/specs/2026-05-01-dj-delivery-bump-design.md"
```

---

## Task 2: `completeOrder` accepts `deliveredBy`

**Files:**
- Modify: `functions/orders.js`
- Modify: `functions/orders.test.mjs` (or whichever existing test file covers completeOrder)

- [ ] **Step 1: Find the existing completeOrder test file**

Run `grep -rn "completeOrder" functions/ | grep -i test` to locate. If multiple exist, the one with handler-level tests is the target.

- [ ] **Step 2: Write the failing tests**

Append to the located test file:

```js
describe('completeOrder — deliveredBy', () => {
  it('accepts deliveredBy when fulfillment === delivery', async () => {
    // Mock setup mirrors existing tests in this file. Ensure the order
    // doc fixture has `fulfillment: 'delivery'`.
    // After completion, expect:
    //   - order.deliveredBy === 'dj'
    //   - order.deliveredBySetAt is a Timestamp
    //   - order.deliveredBySetBy === actor uid
    //   - order.deliveryBumpAtCompletion === 0.05 (or current config)
    //   - subcollection orders/{id}/bumpAudit has one doc with
    //     { source: 'web-completion' or 'slack-completion', oldValue: null,
    //       newValue: 'dj' }
  })

  it('rejects deliveredBy when fulfillment === pickup', async () => {
    // Expect HttpsError invalid-argument
  })

  it('rejects deliveredBy not in splits keys', async () => {
    // Expect HttpsError invalid-argument
  })

  it('completes without deliveredBy (null) when fulfillment === delivery', async () => {
    // Order completes; deliveredBy stays null; no audit entry written.
  })
})
```

(The exact mock pattern will mirror the existing completeOrder tests in this file. Read 2-3 existing tests first to copy the setup.)

- [ ] **Step 3: Extend `completeOrder`**

In `functions/orders.js`:

3a. Pull the active config inside `completeOrder` (the function already calls `loadPayoutConfig` indirectly via `runCompletionTransaction`; check if it has access). If not, load it:

```js
const payoutCfg = await loadPayoutConfig(db)
```

3b. Read `deliveredBy` from the request data (default null):

```js
const deliveredBy = data?.deliveredBy
const deliveredByNormalized = (deliveredBy === 'alex' || deliveredBy === 'dj' || deliveredBy === 'kyle') ? deliveredBy : null
```

3c. Validate against fulfillment:

```js
const fulfillmentLc =
  String(d.fulfillment).toLowerCase() === 'pickup' ? 'pickup' : 'delivery'

if (deliveredByNormalized && fulfillmentLc !== 'delivery') {
  throw new HttpsError('invalid-argument', 'deliveredBy can only be set on delivery orders.')
}
if (deliveredBy != null && deliveredByNormalized == null) {
  throw new HttpsError('invalid-argument', 'deliveredBy must be one of alex, dj, kyle, or null.')
}
```

3d. Extend `completionPatch`:

```js
const completionPatch = {
  // ... existing fields
  deliveredBy: deliveredByNormalized,
  deliveredBySetAt: deliveredByNormalized ? FieldValue.serverTimestamp() : null,
  deliveredBySetBy: deliveredByNormalized ? request.auth.uid : null,
  deliveryBumpAtCompletion: payoutCfg.deliveryBump,  // snapshot for audit
}
```

3e. After `runCompletionTransaction` succeeds, if `deliveredByNormalized`, write the initial bumpAudit doc:

```js
if (deliveredByNormalized) {
  await ref.collection('bumpAudit').add({
    setBy: request.auth.uid,
    setAt: FieldValue.serverTimestamp(),
    oldValue: null,
    newValue: deliveredByNormalized,
    source: data?.source === 'slack-completion' ? 'slack-completion' : 'web-completion',
    reason: null,
  })
}
```

(The Slack interactivity handler in Task 5 will pass `source: 'slack-completion'` when invoking via callable. Web pass nothing → defaults to `web-completion`.)

3f. Pass `deliveredBy` + `deliveryBumpAtCompletion` into `runCompletionTransaction` so `bumpCrewEarned` can use them. Update the call site:

```js
await runCompletionTransaction(db, {
  orderRef: ref,
  completionPatch,
  paymentAmount,
  completedMs,
  deliveredBy: deliveredByNormalized,
  deliveryBump: payoutCfg.deliveryBump,
})
```

- [ ] **Step 4: Run tests + commit**

```bash
cd .claude/worktrees/dj-delivery-bump
npx vitest run functions/
git add functions/orders.js functions/<orders-test-file>
git commit -m "feat(orders): completeOrder accepts deliveredBy on delivery orders

deliveredBy validated against splits keys and fulfillment === delivery.
On set, writes deliveredBySetAt + deliveredBySetBy to the order doc,
snapshots deliveryBumpAtCompletion (so config changes don't rewrite
historical earnings), and writes the initial bumpAudit subcollection
entry. deliveredBy + deliveryBump pass through to
runCompletionTransaction so bumpCrewEarned can apply the bump."
```

---

## Task 3: `bumpCrewEarned` uses adjusted splits + tracks running totals

**Files:**
- Modify: `functions/financeStats.js`
- Modify: `functions/financeStats.test.mjs`

- [ ] **Step 1: Read the current `bumpCrewEarned` and `runCompletionTransaction`**

Run `grep -n "bumpCrewEarned\|runCompletionTransaction" functions/financeStats.js`.

The current `bumpCrewEarned(prev, pool, splits)` reads from the static splits. Extend it to optionally take `deliveredBy` + `deliveryBump`, compute adjusted splits via `applyDeliveryBump`, and track per-member running totals.

- [ ] **Step 2: Write the failing tests**

```js
describe('bumpCrewEarned — delivery bump', () => {
  const baseSplits = { alex: 0.35, dj: 0.35, kyle: 0.30 }
  const initialCrew = {
    members: {
      alex: { totalEarned: 0, totalPaid: 0, balance: 0, totalDeliveryBumps: 0, deliveryBumpCount: 0, lastUpdatedAt: null },
      dj:   { totalEarned: 0, totalPaid: 0, balance: 0, totalDeliveryBumps: 0, deliveryBumpCount: 0, lastUpdatedAt: null },
      kyle: { totalEarned: 0, totalPaid: 0, balance: 0, totalDeliveryBumps: 0, deliveryBumpCount: 0, lastUpdatedAt: null },
    },
    payoutLog: [],
  }

  it('without deliveredBy: standard splits (no bump tracking)', () => {
    const next = bumpCrewEarned(initialCrew, 100, baseSplits)
    expect(next.members.alex.totalEarned).toBeCloseTo(35, 4)
    expect(next.members.dj.totalEarned).toBeCloseTo(35, 4)
    expect(next.members.kyle.totalEarned).toBeCloseTo(30, 4)
    expect(next.members.alex.deliveryBumpCount).toBe(0)
  })

  it('with deliveredBy=dj + bump 0.05: adjusted splits + dj bump tracking', () => {
    const next = bumpCrewEarned(initialCrew, 100, baseSplits, { deliveredBy: 'dj', deliveryBump: 0.05 })
    // dj: 0.40 of $100 = $40
    expect(next.members.dj.totalEarned).toBeCloseTo(40, 2)
    // alex: 0.35 * (0.60 / 0.65) = ~0.3231 of $100 = $32.31
    expect(next.members.alex.totalEarned).toBeCloseTo(32.31, 2)
    // kyle: 0.30 * (0.60 / 0.65) = ~0.2769 of $100 = $27.69
    expect(next.members.kyle.totalEarned).toBeCloseTo(27.69, 2)
    // Sum still = $100
    const sum = next.members.alex.totalEarned + next.members.dj.totalEarned + next.members.kyle.totalEarned
    expect(sum).toBeCloseTo(100, 2)
    // dj's totalDeliveryBumps tracks dollar delta vs unbumped: $40 - $35 = $5
    expect(next.members.dj.totalDeliveryBumps).toBeCloseTo(5, 2)
    expect(next.members.dj.deliveryBumpCount).toBe(1)
    // alex/kyle do NOT get negative tracked
    expect(next.members.alex.totalDeliveryBumps).toBe(0)
    expect(next.members.alex.deliveryBumpCount).toBe(0)
    expect(next.members.kyle.totalDeliveryBumps).toBe(0)
    expect(next.members.kyle.deliveryBumpCount).toBe(0)
  })

  it('with deliveredBy + bump=0: no bump tracking but adjusted splits == base', () => {
    const next = bumpCrewEarned(initialCrew, 100, baseSplits, { deliveredBy: 'dj', deliveryBump: 0 })
    expect(next.members.dj.totalEarned).toBeCloseTo(35, 4)
    expect(next.members.dj.deliveryBumpCount).toBe(0)  // no count when no money moved
  })
})
```

- [ ] **Step 3: Extend `bumpCrewEarned`**

Modify the signature and body:

```js
const { applyDeliveryBump } = require('./payoutConfig')

function bumpCrewEarned(prev, pool, splits = DEFAULT_CONFIG.splits, opts = {}) {
  const { deliveredBy = null, deliveryBump = 0 } = opts
  const adjusted = applyDeliveryBump(splits, deliveryBump, deliveredBy)

  // Compute per-member earnings using adjusted (bumped) splits.
  // Track totalDeliveryBumps + deliveryBumpCount on the deliverer only,
  // by the dollar delta vs unbumped.
  const baseDeliveredBy = deliveredBy && splits?.[deliveredBy] ? Number(splits[deliveredBy]) : 0
  const adjustedDeliveredBy = deliveredBy && adjusted?.[deliveredBy] ? adjusted[deliveredBy] : 0
  const dollarDelta = round2((adjustedDeliveredBy - baseDeliveredBy) * pool)

  const shareKeys = adjusted && typeof adjusted === 'object' ? Object.keys(adjusted) : []
  const members = { ...(prev?.members || {}) }
  for (const k of shareKeys) {
    const cur = members[k] || {
      totalEarned: 0, totalPaid: 0, balance: 0,
      totalDeliveryBumps: 0, deliveryBumpCount: 0, lastUpdatedAt: null,
    }
    const earnedDelta = round2(pool * (Number(adjusted[k]) || 0))
    members[k] = {
      ...cur,
      totalEarned: round2((Number(cur.totalEarned) || 0) + earnedDelta),
      balance: round2((Number(cur.balance) || 0) + earnedDelta),
      totalDeliveryBumps: cur.totalDeliveryBumps || 0,
      deliveryBumpCount: cur.deliveryBumpCount || 0,
      lastUpdatedAt: nowMs(),  // or whatever the existing pattern is
    }
  }

  // Track bump on the deliverer ONLY when both a deliveredBy is set AND
  // dollarDelta > 0 (no-op when bump === 0).
  if (deliveredBy && dollarDelta > 0 && members[deliveredBy]) {
    const cur = members[deliveredBy]
    members[deliveredBy] = {
      ...cur,
      totalDeliveryBumps: round2((Number(cur.totalDeliveryBumps) || 0) + dollarDelta),
      deliveryBumpCount: (Number(cur.deliveryBumpCount) || 0) + 1,
    }
  }

  const payoutLog = Array.isArray(prev?.payoutLog) ? prev.payoutLog : []
  return { ...prev, members, payoutLog }
}
```

(The exact `lastUpdatedAt` pattern depends on existing code; mirror what's already there.)

- [ ] **Step 4: Update `runCompletionTransaction` to thread the new fields**

Pass `deliveredBy` + `deliveryBump` into `bumpCrewEarned`:

```js
const nextCrew = bumpCrewEarned(cPrev, pool, payoutCfg.splits, {
  deliveredBy: opts.deliveredBy,
  deliveryBump: opts.deliveryBump,
})
```

- [ ] **Step 5: `defaultCrewDoc` extension**

Update so new docs initialize `totalDeliveryBumps: 0` and `deliveryBumpCount: 0` per member.

- [ ] **Step 6: Run tests + commit**

```bash
cd .claude/worktrees/dj-delivery-bump
npx vitest run functions/financeStats.test.mjs functions/payoutConfig.test.mjs
git add functions/financeStats.js functions/financeStats.test.mjs
git commit -m "feat(payout): bumpCrewEarned applies deliveryBump + tracks running totals

Optional opts.deliveredBy + opts.deliveryBump trigger applyDeliveryBump
to compute adjusted splits. totalEarned reflects the bumped
distribution. The deliverer's totalDeliveryBumps gets the dollar delta
vs unbumped; deliveryBumpCount increments by 1. Other members'
negative deltas are NOT tracked on totalDeliveryBumps (which means
'dollars earned FROM bumps')."
```

---

## Task 4: `editOrderDeliveredBy` callable

**Files:**
- Create: `functions/orderDeliveredByEdit.js`
- Create: `functions/orderDeliveredByEdit.test.mjs`
- Modify: `functions/index.js`

- [ ] **Step 1: Write the failing tests**

Create `functions/orderDeliveredByEdit.test.mjs`:

```js
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { _testonly } from './orderDeliveredByEdit.js'

const { handle, SEVEN_DAYS_MS } = _testonly

describe('editOrderDeliveredBy', () => {
  let firestore
  let now

  beforeEach(() => {
    now = 1714560000000
    // Mock setup here similar to other handler tests in this codebase.
    // Need: users/{uid} returns { role: 'admin' }; orders/{id} returns
    // { fulfillment: 'delivery', completedAtMs: now - 1000, deliveredBy: 'dj',
    //   deliveryBumpAtCompletion: 0.05, paymentAmount: 100 };
    // meta/payoutConfig returns DEFAULT_CONFIG.
  })

  it('throws unauthenticated when request.auth missing', async () => {
    // ...
  })

  it('throws permission-denied when role !== admin', async () => {
    // ...
  })

  it('throws not-found when order does not exist', async () => {
    // ...
  })

  it('throws failed-precondition when fulfillment !== delivery', async () => {
    // ...
  })

  it('throws failed-precondition when order is older than 7 days', async () => {
    // completedAtMs = now - SEVEN_DAYS_MS - 1000
  })

  it('changes deliveredBy from dj → kyle', async () => {
    // Recompute: subtract dj-bump distribution, add kyle-bump distribution.
    // crew totals reflect the swap.
    // bumpAudit has new entry { oldValue: 'dj', newValue: 'kyle', source: 'admin-edit' }.
    // Order doc updated with new deliveredBy + deliveredBySetAt + deliveredBySetBy.
  })

  it('clears deliveredBy (kyle → null)', async () => {
    // Recompute: subtract kyle-bump distribution, add unbumped distribution.
    // kyle's totalDeliveryBumps decremented by the prior dollar delta;
    // deliveryBumpCount decremented by 1.
  })

  it('sets deliveredBy when previously null', async () => {
    // Recompute: subtract unbumped distribution, add bumped distribution.
    // Deliverer's totalDeliveryBumps += dollar delta; deliveryBumpCount += 1.
  })

  it('no-op when newValue === current value', async () => {
    // No transaction writes. No audit entry. Returns ok with noChange: true.
  })

  it('uses deliveryBumpAtCompletion (not live config) for the bump amount', async () => {
    // Order completed with bump=0.05. Live config now bump=0.10.
    // Edit recomputes using 0.05.
  })
})
```

(Detailed mock setup mirrors `salesAdvisor.test.mjs` and `peopleCallables.test.mjs` patterns.)

- [ ] **Step 2: Implement `orderDeliveredByEdit.js`**

```js
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const admin = require('firebase-admin')
const { FieldValue } = require('firebase-admin/firestore')
const { applyDeliveryBump, splitPool, round2 } = require('./payoutConfig')

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
const SPLIT_KEYS = ['alex', 'dj', 'kyle']

function handle({ firestore, nowFn }) {
  return async function handler({ data, auth }) {
    if (!auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required.')
    const userSnap = await firestore.collection('users').doc(auth.uid).get()
    const role = String((userSnap.exists ? userSnap.data() : {})?.role || '')
    if (role !== 'admin') throw new HttpsError('permission-denied', 'Admin only.')

    const orderId = String(data?.orderId || '').trim()
    const reason = data?.reason ? String(data.reason).slice(0, 500) : null
    const newRaw = data?.deliveredBy
    const newValue = (newRaw === null || newRaw === undefined)
      ? null
      : SPLIT_KEYS.includes(newRaw) ? newRaw : undefined
    if (newValue === undefined) {
      throw new HttpsError('invalid-argument', 'deliveredBy must be alex, dj, kyle, or null.')
    }
    if (!orderId) {
      throw new HttpsError('invalid-argument', 'orderId required.')
    }

    const orderRef = firestore.collection('orders').doc(orderId)
    const orderSnap = await orderRef.get()
    if (!orderSnap.exists) throw new HttpsError('not-found', 'Order not found.')
    const order = orderSnap.data() || {}

    if (String(order.fulfillment || '').toLowerCase() !== 'delivery') {
      throw new HttpsError('failed-precondition', 'Order is not a delivery order.')
    }
    const completedMs = Number(order.completedMs) || 0
    if (!completedMs || nowFn() - completedMs > SEVEN_DAYS_MS) {
      throw new HttpsError('failed-precondition', 'Edit window closed (7 days after completion).')
    }

    const oldValue = SPLIT_KEYS.includes(order.deliveredBy) ? order.deliveredBy : null
    if (oldValue === newValue) {
      return { ok: true, noChange: true }
    }

    const bump = Number(order.deliveryBumpAtCompletion) || 0
    const cfgSnap = await firestore.collection('meta').doc('payoutConfig').get()
    const cfg = cfgSnap.exists ? cfgSnap.data() : {}
    const splits = (cfg && cfg.splits) || { alex: 0.35, dj: 0.35, kyle: 0.30 }
    const pool = Number(order.paymentAmount) || 0  // adjust to whatever pool definition existing code uses

    const oldAdjusted = applyDeliveryBump(splits, bump, oldValue)
    const newAdjusted = applyDeliveryBump(splits, bump, newValue)

    // Compute per-member earnings deltas: newAdjusted - oldAdjusted (× pool)
    const memberDeltas = {}
    for (const k of SPLIT_KEYS) {
      const oldShare = Number(oldAdjusted[k]) || 0
      const newShare = Number(newAdjusted[k]) || 0
      memberDeltas[k] = round2(pool * (newShare - oldShare))
    }

    // Compute bump-tracking deltas: only the deliverer side moves.
    const oldBumpDollars = oldValue
      ? round2((Number(oldAdjusted[oldValue]) - Number(splits[oldValue])) * pool)
      : 0
    const newBumpDollars = newValue
      ? round2((Number(newAdjusted[newValue]) - Number(splits[newValue])) * pool)
      : 0

    await firestore.runTransaction(async (tx) => {
      const crewRef = firestore.collection('meta').doc('djStats')  // verify the actual doc name
      const crewSnap = await tx.get(crewRef)
      const crew = crewSnap.exists ? crewSnap.data() || {} : { members: {} }
      const members = { ...(crew.members || {}) }

      for (const k of SPLIT_KEYS) {
        const cur = members[k] || {
          totalEarned: 0, totalPaid: 0, balance: 0,
          totalDeliveryBumps: 0, deliveryBumpCount: 0,
        }
        const earnedDelta = memberDeltas[k] || 0
        let totalDeliveryBumps = cur.totalDeliveryBumps || 0
        let deliveryBumpCount = cur.deliveryBumpCount || 0
        if (k === oldValue && oldBumpDollars > 0) {
          totalDeliveryBumps = round2(totalDeliveryBumps - oldBumpDollars)
          deliveryBumpCount = Math.max(0, deliveryBumpCount - 1)
        }
        if (k === newValue && newBumpDollars > 0) {
          totalDeliveryBumps = round2(totalDeliveryBumps + newBumpDollars)
          deliveryBumpCount = deliveryBumpCount + 1
        }
        members[k] = {
          ...cur,
          totalEarned: round2((Number(cur.totalEarned) || 0) + earnedDelta),
          balance: round2((Number(cur.balance) || 0) + earnedDelta),
          totalDeliveryBumps,
          deliveryBumpCount,
        }
      }

      tx.set(crewRef, { ...crew, members }, { merge: true })
      tx.update(orderRef, {
        deliveredBy: newValue,
        deliveredBySetAt: FieldValue.serverTimestamp(),
        deliveredBySetBy: auth.uid,
      })
      const auditRef = orderRef.collection('bumpAudit').doc()
      tx.set(auditRef, {
        setBy: auth.uid,
        setAt: FieldValue.serverTimestamp(),
        oldValue,
        newValue,
        source: 'admin-edit',
        reason,
      })
    })

    return { ok: true, oldValue, newValue }
  }
}

exports.editOrderDeliveredBy = onCall(async (req) => {
  const firestore = admin.firestore()
  return handle({ firestore, nowFn: () => Date.now() })({ data: req.data, auth: req.auth })
})

exports._testonly = { handle, SEVEN_DAYS_MS }
```

- [ ] **Step 3: Register in `functions/index.js`**

```js
exports.editOrderDeliveredBy = require('./orderDeliveredByEdit').editOrderDeliveredBy
```

- [ ] **Step 4: Run tests + commit**

```bash
cd .claude/worktrees/dj-delivery-bump
npx vitest run functions/orderDeliveredByEdit.test.mjs
git add functions/orderDeliveredByEdit.js functions/orderDeliveredByEdit.test.mjs functions/index.js
git commit -m "feat(functions): editOrderDeliveredBy callable

Admin-gated. 7-day window from order completion. Recomputes splits
using the snapshotted deliveryBumpAtCompletion (so live config
changes don't rewrite history). Updates the order doc, the crew doc
(member totals + bump tracking), and writes a bumpAudit subcollection
entry — all atomic in one Firestore transaction."
```

---

## Task 5: Slack interactivity — "Delivered by ..." buttons

**Files:**
- Modify: the existing close-out interactivity handler (find via `grep -rn "completeOrder\|interactivity\|action_id" functions/`)

- [ ] **Step 1: Locate the existing close-out interactivity flow**

Run `grep -rn "completeOrder\|action_id.*complete\|orderId.*complete" functions/`. Find where the close-out Slack message is posted with buttons (likely in `functions/orders.js` or a Slack handler module).

- [ ] **Step 2: Extend the close-out message Block Kit**

When `fulfillment === 'delivery'` AND the order has no `deliveredBy` yet, append a new actions block:

```js
{
  type: 'actions',
  block_id: `delivered_by:${orderId}`,
  elements: [
    {
      type: 'button',
      action_id: 'delivered_by_alex',
      text: { type: 'plain_text', text: 'Delivered by Alex' },
      value: JSON.stringify({ orderId, deliveredBy: 'alex' }),
    },
    { /* similar for dj */ },
    { /* similar for kyle */ },
  ],
}
```

- [ ] **Step 3: Add interactivity handler**

Wherever the existing Slack interactivity router lives, add handlers for `delivered_by_alex` / `delivered_by_dj` / `delivered_by_kyle`. Each:

- Parses `orderId` + `deliveredBy` from the action `value`
- Calls a small helper (extract from `editOrderDeliveredBy` shared logic, or inline) that:
  - Reads the order
  - If already set, returns "already marked" toast
  - Otherwise sets `deliveredBy`, recomputes splits, writes audit (`source: 'slack-completion'`)
- Updates the original message: replaces the actions block with a context block reading `Bumped: ${name} +${pct}% (delivered)`

The handler must validate Slack's request signature (existing pattern in the codebase). Reuse whatever auth path the close-out completion button uses.

- [ ] **Step 4: Tests**

Test the message-building helper if extractable; integration test the handler if a pattern exists in this codebase. Don't bog down on full E2E — the helpers are unit-testable; the Slack-side wiring is verified via the existing interactivity test pattern.

- [ ] **Step 5: Commit**

```bash
cd .claude/worktrees/dj-delivery-bump
git add functions/<files>
git commit -m "feat(slack): Delivered-by buttons on close-out completion message

When an order is marked completed via Slack and fulfillment is
delivery, three buttons render alongside (Delivered by Alex / DJ /
Kyle). Click sets deliveredBy on the order, recomputes the split,
writes a bumpAudit entry with source='slack-completion', and updates
the message to show the bump inline."
```

---

## Task 6: `/spoils` output extension

**Files:**
- Modify: `functions/financeSlackCommands.js`
- Modify: `functions/financeSlackCommands.test.mjs` (if exists)

- [ ] **Step 1: Locate the per-member rendering**

Run `grep -n "spoils\|members\[\|totalEarned" functions/financeSlackCommands.js`. Find where each member's earnings line is built.

- [ ] **Step 2: Extend the line**

Today's pattern (approximate):

```js
text += `${memberLabel(k)} — ${formatUSD(m.totalEarned)}\n`
```

Extend:

```js
const bumpCount = Number(m.deliveryBumpCount) || 0
const bumpDollars = Number(m.totalDeliveryBumps) || 0
const bumpSubline = bumpCount > 0
  ? ` (incl. ${formatUSD(bumpDollars)} from ${bumpCount} delivered order${bumpCount === 1 ? '' : 's'})`
  : ''
text += `${memberLabel(k)} — ${formatUSD(m.totalEarned)}${bumpSubline}\n`
```

- [ ] **Step 3: Tests**

Add cases:
- Member with `deliveryBumpCount === 0` → no subline rendered
- Member with `deliveryBumpCount === 1` → "1 delivered order" (singular)
- Member with `deliveryBumpCount > 1` → "N delivered orders" (plural)

- [ ] **Step 4: Commit**

```bash
cd .claude/worktrees/dj-delivery-bump
git add functions/financeSlackCommands.js functions/financeSlackCommands.test.mjs
git commit -m "feat(slack): /spoils renders delivery-bump subline per member

When a crew member's deliveryBumpCount > 0, append an inline
parenthetical to their earnings line: '(incl. \$X from N delivered
orders)'. No subline when count is 0. Pluralizes 'order' correctly."
```

---

## Task 7: Web UI — SaleMessenger radio + EditDeliveredByButton + PayoutConfigPanel

**Files:**
- Modify: `src/components/tires/SaleMessenger.jsx`
- Create: `src/components/admin/payout/EditDeliveredByButton.jsx`
- Create: `src/components/admin/payout/EditDeliveredByButton.test.jsx`
- Modify: `src/components/admin/payout/PayoutConfigPanel.jsx`

- [ ] **Step 1: Sale Messenger radio**

In `SaleMessenger.jsx`, add state:

```jsx
const [deliveredBy, setDeliveredBy] = useState(null)
```

Render below the existing `fulfillment` radio (only when `fulfillment === 'Delivery'`):

```jsx
{fulfillment === 'Delivery' ? (
  <fieldset className="mt-3">
    <legend className="text-xs uppercase tracking-wide text-zinc-500">Who delivered?</legend>
    <div className="mt-1 flex flex-wrap gap-3 text-sm">
      {['alex', 'dj', 'kyle'].map((k) => (
        <label key={k} className="inline-flex items-center gap-1.5">
          <input
            type="radio"
            name="deliveredBy"
            checked={deliveredBy === k}
            onChange={() => setDeliveredBy(k)}
          />
          {k === 'alex' ? 'Alex' : k === 'dj' ? 'DJ' : 'Kyle'}
        </label>
      ))}
      <label className="inline-flex items-center gap-1.5">
        <input type="radio" name="deliveredBy" checked={deliveredBy === null} onChange={() => setDeliveredBy(null)} />
        <span className="text-zinc-500">Mark later</span>
      </label>
    </div>
  </fieldset>
) : null}
```

In the existing submit handler that calls `completeOrder` / `sendTireSaleSms`, include `deliveredBy` in the payload.

Add a test (or extend existing) confirming the radio renders only when fulfillment === Delivery and submitting passes the value through.

- [ ] **Step 2: EditDeliveredByButton component**

Create `src/components/admin/payout/EditDeliveredByButton.jsx`:

```jsx
import { useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../../../firebase/config'
import { useToast } from '../../../context/ToastContext.jsx'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export function EditDeliveredByButton({ order, currentUserRole, onUpdated }) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [picked, setPicked] = useState(order?.deliveredBy ?? null)
  const [reason, setReason] = useState('')
  const { toast } = useToast()

  const completedMs = Number(order?.completedMs) || 0
  const withinWindow = completedMs > 0 && Date.now() - completedMs <= SEVEN_DAYS_MS
  const isDelivery = String(order?.fulfillment || '').toLowerCase() === 'delivery'
  const visible = currentUserRole === 'admin' && isDelivery && withinWindow

  if (!visible) return null

  async function save() {
    setPending(true)
    try {
      const fn = httpsCallable(functions, 'editOrderDeliveredBy')
      const result = await fn({ orderId: order.id, deliveredBy: picked, reason: reason.trim() || null })
      toast(`Saved. Deliverer: ${picked || 'cleared'}`, 'success')
      onUpdated?.(result?.data)
      setOpen(false)
    } catch (err) {
      toast(`Failed: ${err?.message || 'unknown error'}`, 'error')
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-200 hover:border-amber-600/40"
      >
        Edit deliverer
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <h3 className="text-sm font-semibold text-zinc-100">Edit deliverer for #{order.id}</h3>
            <p className="mt-1 text-xs text-zinc-400">Currently: {order?.deliveredBy ?? 'not set'}</p>
            <fieldset className="mt-3 flex flex-col gap-1.5 text-sm">
              {['alex', 'dj', 'kyle'].map((k) => (
                <label key={k} className="inline-flex items-center gap-2">
                  <input type="radio" name="deliveredByEdit" checked={picked === k} onChange={() => setPicked(k)} />
                  {k === 'alex' ? 'Alex' : k === 'dj' ? 'DJ' : 'Kyle'}
                </label>
              ))}
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="deliveredByEdit" checked={picked === null} onChange={() => setPicked(null)} />
                Clear
              </label>
            </fieldset>
            <label className="mt-3 block text-xs text-zinc-400">
              Reason for change
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-sm text-zinc-100"
                placeholder="e.g. picked wrong person at close-out"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300">Cancel</button>
              <button
                type="button"
                disabled={pending}
                onClick={() => void save()}
                className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm font-medium text-zinc-100 disabled:opacity-40"
              >
                {pending ? 'Saving…' : 'Save change'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
```

- [ ] **Step 3: EditDeliveredByButton tests**

```jsx
/** @vitest-environment jsdom */
import { describe, expect, it, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { EditDeliveredByButton } from './EditDeliveredByButton.jsx'

afterEach(cleanup)

const recentOrder = (overrides) => ({
  id: 'O1',
  fulfillment: 'delivery',
  completedMs: Date.now() - 1000,
  deliveredBy: 'dj',
  ...overrides,
})

describe('EditDeliveredByButton', () => {
  it('renders for admin within 7 days on delivery order', () => {
    const { container } = render(<EditDeliveredByButton order={recentOrder()} currentUserRole="admin" />)
    expect(container.querySelector('button')).not.toBeNull()
  })

  it('hides for non-admin', () => {
    const { container } = render(<EditDeliveredByButton order={recentOrder()} currentUserRole="viewer" />)
    expect(container.querySelector('button')).toBeNull()
  })

  it('hides when fulfillment is pickup', () => {
    const order = recentOrder({ fulfillment: 'pickup' })
    const { container } = render(<EditDeliveredByButton order={order} currentUserRole="admin" />)
    expect(container.querySelector('button')).toBeNull()
  })

  it('hides when older than 7 days', () => {
    const order = recentOrder({ completedMs: Date.now() - 8 * 86400000 })
    const { container } = render(<EditDeliveredByButton order={order} currentUserRole="admin" />)
    expect(container.querySelector('button')).toBeNull()
  })
})
```

(Wrap in `ToastProvider` if needed; mirror existing component test patterns.)

- [ ] **Step 4: PayoutConfigPanel field**

In `src/components/admin/payout/PayoutConfigPanel.jsx`, add a `deliveryBump` numeric field that maps to a 0–50% range (display as percent, store as fraction). Existing config save flow handles persistence via `updatePayoutConfig` callable.

Search the file for the existing `splits` form fields and follow the same pattern.

- [ ] **Step 5: Run tests + commit**

```bash
cd .claude/worktrees/dj-delivery-bump
npx vitest run src/
git add src/components/tires/SaleMessenger.jsx src/components/admin/payout/EditDeliveredByButton.jsx src/components/admin/payout/EditDeliveredByButton.test.jsx src/components/admin/payout/PayoutConfigPanel.jsx
git commit -m "feat(payout): web UI for deliveredBy + deliveryBump config

SaleMessenger gets a 'Who delivered?' radio when fulfillment ===
Delivery; submission threads deliveredBy through to completeOrder.
EditDeliveredByButton renders only for admins within 7 days on
delivery orders, opens a small modal that calls the
editOrderDeliveredBy callable. PayoutConfigPanel gains the
deliveryBump field (0-50%, default 5%)."
```

---

## Task 8: Lint, bundle, full vitest, manual smoke

**Files:** none

- [ ] **Step 1: Lint**

`cd .claude/worktrees/dj-delivery-bump && npm run lint`

Expected: 0 errors.

- [ ] **Step 2: Bundle**

`cd .claude/worktrees/dj-delivery-bump && npm run build && npx size-limit`

Expected: tires page chunk under 47 KB. EditDeliveredByButton lands in the admin chunk; small (~2 KB).

- [ ] **Step 3: Full vitest**

`cd .claude/worktrees/dj-delivery-bump && npx vitest run src/ functions/`

Expected: green.

- [ ] **Step 4: Manual smoke (skip if no test backend access; pre-deploy)**

`npm run dev`. Sign in as admin. Sale Messenger flow: pick Delivery → "Who delivered?" radio appears → pick DJ → submit → order completes → check Slack #fleet-ops shows the inline "Bumped: DJ +5%" line. Run `/spoils` in Slack to see DJ's subline. Edit the order's deliverer via the admin button; re-run `/spoils` to confirm the recompute.

- [ ] **Step 5: HOLD for user direction on push**

Do NOT push without user confirmation.

---

## Verification checklist (final)

- All vitest tests green
- Lint clean
- Bundle within caps
- `applyDeliveryBump` zero-sums correctly
- `completeOrder` accepts/rejects deliveredBy per fulfillment
- `bumpCrewEarned` uses adjusted splits + tracks running totals
- `editOrderDeliveredBy` callable: admin-only, 7-day window, atomic recompute, audit log
- Slack 3-button flow on close-out posts and updates the message inline
- `/spoils` per-member subline renders when count > 0
- Sale Messenger radio threads deliveredBy through completeOrder
- EditDeliveredByButton visibility rules correct
- PayoutConfigPanel saves deliveryBump

---

## Out of scope (deferred)

- House cost-recovery refactor (separate sub-project)
- Multi-event stacking
- DM notifications on edits
- Streak tracking
- Pre-existing order backfill
