# DJ delivery share-bump (v1) — design

**Status:** approved 2026-05-01
**Branch target:** `dj-delivery-bump`
**Roadmap entry shipped:** *DJ "I delivered / met customer" share-bump* (Next).

## Goal

When a crew member personally delivers an order (face-to-face with the customer), they get a small bump to their share of the payout split for that order. The bump is configurable in `meta/payoutConfig`, only applies to delivered orders (not pickup), and shows up as a distinct subline in payout reports. Operates on today's bundled split model; the house cost-recovery refactor stays as roadmap debt.

## Non-goals (per brainstorming decisions)

- **House cost-recovery refactor.** The `meta/payoutConfig.splits` model still bundles cost recovery into the splits. Refactoring that is a separate sub-project and lands first if/when its own spec ships.
- **Multi-event stacking.** "I met customer" and "I delivered" collapse into a single `deliveredBy` mark. No additive bumps for both.
- **Active push notifications on edits.** Audit log captures every change; no DMs.
- **Pre-existing order backfill.** Bump applies only to orders completed after this deploys.
- **Streak tracking** (consecutive deliveries, etc.). Distinct feature.

## Resolved policy decisions (from brainstorming)

| # | Question | Decision |
|---|---|---|
| 1 | Who can be marked? | Any crew member listed in splits (alex/dj/kyle). Single `deliveredBy` field per order. Gated on `fulfillment === 'Delivery'`. |
| 2 | Fixed or configurable bump? | Configurable. `meta/payoutConfig.deliveryBump: 0.05` (default). |
| 3 | When mark is settable? | At close-out + admin-only edit within 7 days. After 7 days, immutable. Audit log captures all events. |
| 4 | Where bump money comes from? | Zero-sum redistribution within today's bundled splits. Total pool unchanged. |
| 5 | UI placement? | Slack close-out interactivity buttons (3 radios) + Sale Messenger web close-out radio. Either path captures it. |
| 6 | Notifications? | Inline subline added to existing close-out Slack message. Audit log only — no DMs. |
| 7 | Multi-event stacking? | Collapsed to single field. Moot. |
| 8 | Reporting line item? | Per-member running totals on crew doc (`totalDeliveryBumps`, `deliveryBumpCount`). `/spoils` output gets an inline subline when count > 0. |

## Data model

### `meta/payoutConfig` extension

```js
{
  splits: { alex: 0.35, dj: 0.35, kyle: 0.30 },
  taxes: { ... },
  deliveryBump: 0.05,        // NEW. Number in [0, 0.5]. Default 0.05 (5 percentage points).
  updatedAt, updatedBy,
}
```

`validatePayoutConfig` adds a `deliveryBump` rule: `Number.isFinite`, `0 <= deliveryBump <= 0.5`. Missing field defaults to `0.05`.

### `orders/{orderId}` extension

```js
{
  // ... existing fields
  fulfillment: 'pickup' | 'delivery',
  deliveredBy: 'alex' | 'dj' | 'kyle' | null,  // NEW. Null until set; only meaningful when fulfillment === 'delivery'.
  deliveredBySetAt: Timestamp | null,            // NEW. When deliveredBy was first set.
  deliveredBySetBy: uid | null,                  // NEW. Who set it (matches existing actorUid pattern).
}
```

### `orders/{orderId}/bumpAudit/{auto-id}` (new subcollection)

```js
{
  setBy: uid,
  setAt: ServerTimestamp,
  oldValue: 'alex' | 'dj' | 'kyle' | null,
  newValue: 'alex' | 'dj' | 'kyle' | null,
  source: 'slack-completion' | 'web-completion' | 'admin-edit',
  reason: string | null,                          // Free-text from admin edit modal; null on initial set.
}
```

One doc per mark or edit. Subcollection so we can query per-order audit history without polluting the order doc.

### Crew doc (`meta/djStats` or current name) extension

For each `members[k]` (alex/dj/kyle):

```js
{
  totalEarned: 0,
  totalPaid: 0,
  balance: 0,
  totalDeliveryBumps: 0,         // NEW. Cumulative dollar delta vs unbumped.
  deliveryBumpCount: 0,          // NEW. Cumulative count of orders that bumped this member.
  lastUpdatedAt: ts,
}
```

## Computation: zero-sum bump redistribution

Given `splits = { alex: 0.35, dj: 0.35, kyle: 0.30 }`, `deliveryBump = 0.05`, and `deliveredBy = 'dj'`:

```
new_dj = 0.35 + 0.05 = 0.40
remaining = 1 - 0.40 = 0.60
old_others_total = 0.35 + 0.30 = 0.65
new_alex = 0.35 * (0.60 / 0.65) ≈ 0.3231
new_kyle = 0.30 * (0.60 / 0.65) ≈ 0.2769
sum check = 0.40 + 0.3231 + 0.2769 = 1.0 ✓
```

For a $100 pool:
- Without bump: alex $35, dj $35, kyle $30
- With dj bump: alex $32.31, dj $40, kyle $27.69
- Per-member delta vs unbumped: alex -$2.69, dj +$5.00, kyle -$2.31
- `totalDeliveryBumps` adds the dj delta only (+$5). The negative deltas on alex/kyle are NOT subtracted from their `totalDeliveryBumps`; that field tracks "how much this member earned FROM bumps", not "net bump impact across all orders".

Pure function `applyDeliveryBump(splits, deliveryBump, deliveredBy) → adjustedSplits` lives in `functions/payoutConfig.js` alongside `splitPool`.

Edge cases in the function:
- `deliveredBy === null` → return splits unchanged
- `deliveredBy` not in splits keys → return splits unchanged (defensive)
- `deliveryBump === 0` → return splits unchanged (no-op)
- `splits[deliveredBy] + deliveryBump >= 1.0` → clamp `new_deliveredBy` to 0.95 (defensive ceiling)
- All other splits sum to 0 (impossible today; defensive) → just give the deliverer everything

## Components

### Functions

```
functions/payoutConfig.js          MODIFY  validatePayoutConfig accepts deliveryBump.
                                            Add applyDeliveryBump pure helper.
                                            DEFAULT_CONFIG gains deliveryBump: 0.05.
functions/orders.js                MODIFY  completeOrder accepts deliveredBy.
                                            Validates: must be a splits key; only when
                                            fulfillment === 'delivery'. Writes initial
                                            bumpAudit entry.
functions/financeStats.js          MODIFY  bumpCrewEarned uses applyDeliveryBump when
                                            order has deliveredBy. Tracks
                                            totalDeliveryBumps + deliveryBumpCount on
                                            the deliverer.
functions/financeSlackCommands.js  MODIFY  /spoils output renders the bump subline
                                            when deliveryBumpCount > 0.
functions/orderDeliveredByEdit.js  CREATE  New onCall: editOrderDeliveredBy. Admin-
                                            gated, 7-day window, recomputes splits
                                            atomically.
functions/orderDeliveredByEdit.test.mjs CREATE
functions/index.js                 MODIFY  Register editOrderDeliveredBy export.
functions/orders/...               MODIFY  Slack interactivity handler for the new
                                            "Delivered by ..." buttons. Wires to the
                                            same code path as completeOrder.
```

### Frontend

```
src/components/tires/SaleMessenger.jsx       MODIFY  When fulfillment === 'Delivery',
                                                     render 3-radio "Who delivered?".
                                                     Default null. Threads into
                                                     completeOrder payload.
src/components/admin/payout/EditDeliveredByButton.jsx CREATE Admin-only button +
                                                     modal on order detail. Visible
                                                     when fulfillment === 'Delivery'
                                                     AND now - completedAtMs <= 7d.
                                                     Calls editOrderDeliveredBy.
src/components/admin/payout/PayoutConfigPanel.jsx MODIFY  Add deliveryBump field
                                                     to the existing config form.
                                                     Slider or numeric input,
                                                     0–50% (clamped).
```

## Slack flow detail

### Close-out completion message (existing)

The completion message currently posts something like:
```
✅ Order #ABC123 completed
4× Pilot Sport AS 4 / $182.40 each / total $729.60
```

When `fulfillment === 'Delivery'` AND `deliveredBy` is null (i.e., delivery hasn't been marked yet), append three buttons:
```
[Delivered by Alex] [Delivered by DJ] [Delivered by Kyle]
```

Click → invokes existing interactivity handler → calls `setOrderDeliveredBy({ orderId, deliveredBy })` → handler runs the same recompute as `completeOrder` would have, plus writes a `bumpAudit` entry with `source: 'slack-completion'`.

After click, the message updates: buttons replaced with `Bumped: DJ +5% (delivered)`.

For pickup orders OR orders with `deliveredBy` already set, the buttons aren't rendered.

### Existing inline note

Once `deliveredBy` is set (via either path), the close-out message text includes a one-line note: `Bumped: ${name} +${pct}% (delivered)`.

## Web flow detail

### Sale Messenger close-out modal

Below the existing fulfillment radio (Pickup / Delivery):

```
Who delivered?
( ) Alex
( ) DJ
( ) Kyle
( ) Mark later (default)
```

Only rendered when `fulfillment === 'Delivery'`. Submitting completes the order with `deliveredBy` set if a radio is picked, else null.

### Admin edit modal

On the order detail panel (existing), an "Edit deliverer" button when:
- `fulfillment === 'Delivery'`
- `now - completedAtMs <= 7 * 86400000`
- Current user has admin role

Click opens a small modal:
```
Edit deliverer for #ABC123
Currently: DJ
( ) Alex
(•) DJ
( ) Kyle
( ) Clear
Reason for change: [text input]
[Cancel] [Save change]
```

Save → calls `editOrderDeliveredBy({ orderId, deliveredBy, reason })`.

## Audit log

Every set/edit writes one doc to `orders/{orderId}/bumpAudit/`. Reading the subcollection gives the full timeline for an order. No retention policy; subcollection grows unbounded but should never exceed a handful of entries per order.

## `/spoils` output extension

Today's per-crew-member line:
```
DJ — $1,192.26
```

Becomes (when `deliveryBumpCount > 0`):
```
DJ — $1,234.56 (incl. $42.30 from 6 delivered orders)
```

The aggregate `$1,234.56` is `totalEarned` (already inclusive of bumps from the recompute path). The parenthetical surfaces what slice of that came from delivery bumps so the operator can see the bump's contribution.

## Edge cases

- **`fulfillment === 'Pickup'` AND someone tries to set `deliveredBy`** — both `completeOrder` validation and `editOrderDeliveredBy` reject with `invalid-argument`. UI buttons aren't rendered for pickup orders.
- **Editing `deliveredBy` after the 7-day window** — callable rejects with `failed-precondition`. UI hides the button after the window.
- **Recompute on edit (Kyle → DJ)** — read the order's current `deliveredBy`, the order's pool, and current splits. Compute the OLD distribution and the NEW distribution. Subtract OLD from each member's `totalEarned`; add NEW. Update `totalDeliveryBumps` and `deliveryBumpCount` accordingly. Write a `bumpAudit` doc. Atomic transaction.
- **Recompute on edit when `deliveryBump` config has changed since the order completed** — use the bump value that was effective at the time of completion (stored on the order doc as `deliveryBumpAtCompletion`). Prevents config changes from rewriting historical earnings.
  - **NEW field on order**: `deliveryBumpAtCompletion: 0.05` written at `completeOrder` time. Edit callable reads this, not the live config.
- **Two crew members race on Slack buttons** — first interactivity event wins. Second sees `deliveredBy` already set, returns "already marked" toast. The button update message removes the buttons after first success so this is rare.
- **`deliveryBump === 0`** — `applyDeliveryBump` returns splits unchanged. `deliveredBy` is still recorded (for posterity / future bump retroactive-ish recompute if config changes). `totalDeliveryBumps` increment is $0; `deliveryBumpCount` still increments by 1.

## Testing

### Unit (functions/)

- `payoutConfig.applyDeliveryBump`:
  - `deliveredBy: null` → unchanged
  - `deliveryBump: 0` → unchanged
  - `deliveredBy: 'dj'`, bump 0.05 → expected zero-sum redistribution math
  - `deliveredBy: 'unknown'` → unchanged (defensive)
  - `splits[deliveredBy] + bump >= 1.0` → clamp to 0.95

- `payoutConfig.validatePayoutConfig`:
  - Accepts `deliveryBump: 0.05`
  - Rejects `deliveryBump: -0.1` and `deliveryBump: 0.6`
  - Missing `deliveryBump` → defaults to 0.05

- `orders.completeOrder`:
  - `fulfillment === 'pickup'` AND `deliveredBy` set → `invalid-argument`
  - `fulfillment === 'delivery'` AND `deliveredBy === 'dj'` → succeeds; writes order with deliveredBy + deliveredBySetAt + deliveredBySetBy + deliveryBumpAtCompletion + initial bumpAudit doc
  - `deliveredBy: 'unknown_key'` → rejected

- `financeStats.bumpCrewEarned` with `deliveredBy`:
  - Uses adjusted splits from `applyDeliveryBump`
  - Increments `totalDeliveryBumps` (only on the deliverer; by the dollar delta vs unbumped)
  - Increments `deliveryBumpCount` (only on the deliverer; by 1)
  - Other members' `totalEarned` reflects the scaled-down adjusted splits

- `editOrderDeliveredBy`:
  - Auth gate (admin only)
  - 7-day window check
  - `fulfillment === 'pickup'` rejected
  - Recompute math: changing from null → DJ adds the bump; changing from DJ → null removes it; changing from DJ → Kyle reverses DJ's bump and adds Kyle's
  - Audit log entry written
  - Idempotent on no-op (same value as current → no recompute, no audit)

- `financeSlackCommands` `/spoils`:
  - Per-member line shows base earned only when `deliveryBumpCount === 0`
  - Per-member line shows "(incl. $X from N delivered orders)" when count > 0

### Component (src/)

- `SaleMessenger.jsx`:
  - When `fulfillment === 'Pickup'`, no "Who delivered?" radio renders
  - When `fulfillment === 'Delivery'`, 3 radios + "Mark later" render; default is "Mark later"
  - Submitting passes `deliveredBy` (or null) to `completeOrder`

- `EditDeliveredByButton.jsx`:
  - Visible only when fulfillment === 'Delivery' AND completed within 7 days AND user is admin
  - Modal accepts radio + reason text; submit calls callable
  - Loading + error states inline

- `PayoutConfigPanel.jsx`:
  - `deliveryBump` field renders, accepts 0–50%
  - Saves through existing `updatePayoutConfig` callable

## Risks

- **Floating-point precision in the redistribution math.** All distributions go through `round2` (existing helper) before being written to Firestore. Sum-of-rounded should equal `pool` to within $0.01; if drift accumulates, the `splitPool` invariant (last key absorbs the remainder) handles it. Verified in tests.
- **Race condition on simultaneous Slack button clicks** — first writer wins via Firestore transaction; second gets a soft toast. Won't double-bump.
- **Migration question.** Existing orders have no `deliveredBy` field. Reads default to null; no recompute. No backfill scripted.
- **Config change mid-stream.** `deliveryBumpAtCompletion` snapshotted on the order at completion time guards against retroactive impact when admin tweaks the config.

## Out of scope (deferred)

- House cost-recovery refactor (separate sub-project)
- Multi-event stacking (collapsed)
- Active DMs (audit log only)
- Streak / pattern tracking
- Pre-existing order backfill
