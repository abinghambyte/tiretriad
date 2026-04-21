# Patch S: My Queue page + Analytics oversight tabs

Branch: `my-queue-page`

**Depends on Patch Q** (`margin-queue-backend`). Do not cut this branch until Q is merged to main; the callables and schema fields it needs live there.

Scope (files touched):

- `src/pages/MyQueuePage.jsx` - NEW. Kyle-facing (and admin-facing) work surface at `/my-queue`.
- `src/pages/MyQueuePage.test.jsx` - NEW. Render, action dispatch, role gating.
- `src/components/queue/QueueRow.jsx` - NEW. Single queue row with resolve buttons.
- `src/components/queue/QueueRow.test.jsx` - NEW.
- `src/App.jsx` - register the `/my-queue` route (role-gated: `sourcer` | `admin`).
- `src/components/layout/Nav.jsx` (or wherever the primary nav lives - find it) - add a `My Queue` link, role-gated, with the pending-count badge if > 0.
- `src/pages/AnalyticsPage.jsx` - add two new admin-only tabs: `verification-queue` (shows the full pending queue across all users) and `margin-archive` (shows tires with `marginConfirmed: true`, paginated, searchable by MSPN). Tabs are only visible with the `?tab=verification-queue` / `?tab=margin-archive` deep links plus via the tab bar for admins.
- No new Cloud Functions. Uses `enqueueToResearch`, `resolveQueueItem` from Patch Q.

## MyQueuePage spec

Route: `/my-queue`. Protected - non-sourcers and non-admins redirect to `/` with a toast. Admins can access to spot-check; sourcers (Kyle) see this as their primary work surface.

Layout:

- Sticky header with count: `{n} tires need verification`.
- Sort order: `researchQueue.at` desc (newest punts and new enqueues float up).
- Each row (`<QueueRow />`) shows:
  - Tire identity (MSPN + short description, linked to the tire detail page in a new tab)
  - Reason chip (`BELOW FLOOR` amber for `'below-margin-floor'`, `NEEDS RESEARCH` zinc for `'unutilized-needs-research'`)
  - Current retail + current computed margin
  - Three action buttons: `Retail was wrong`, `Confirm and archive`, `Punt`.

Action behavior:

- `Retail was wrong` - opens an inline small form: single number input (pre-filled with current retail), confirm button. Submitting calls `resolveQueueItem(tireId, 'retail-wrong', { newRetail })`. On success, toast `Retail updated and tire returned to catalog`.
- `Confirm and archive` - confirmation modal: `This will archive {MSPN} as permanently sub-floor. It will only be visible to admins in Analytics > Margin archive.` Confirm calls `resolveQueueItem(tireId, 'confirm-archive')`. On success, toast `Archived` and remove from the visible list.
- `Punt` - immediate (no confirm). Calls `resolveQueueItem(tireId, 'punt')`. The row re-sorts but stays visible. Toast `Punted for later`.

Empty state: `Queue is empty. New tires show up here after the nightly sweep or when teammates route them for research.`

Loading state: existing `Spinner` primitive.

Error surface: reuse the app's standard error banner pattern.

## Analytics oversight tabs

In `AnalyticsPage.jsx`, add two new tab ids: `verification-queue` and `margin-archive`. Both admin-only - non-admins cannot see the tabs or deep-link into them.

**Verification queue tab**:
- Same rows as `/my-queue` but across all assignees, grouped by reason, with a `Resolved by` column empty for pending items.
- Read-only. Admins who want to resolve go through `/my-queue` (simpler to maintain one resolution UI).
- Subheader: `Live view of pending verification items. Resolve from /my-queue.`

**Margin archive tab**:
- Paginated list (50 per page) of tires where `marginConfirmed === true`.
- Columns: MSPN, description, retail at archive, computed margin at archive, archived on (from `researchQueue.resolvedAt`), archived by.
- Simple text search filter on MSPN/description.
- No resolve / un-archive action in v1. Un-archive is a conscious decision that can be handled directly on the tire doc by an admin; a UI path adds risk for no proven benefit.

## Tasks

1. Build `QueueRow.jsx` as a pure presentational component receiving `{ tire, onResolve }`. All action dispatches go through `onResolve(outcome, extras)`. Easier to test.
2. Build `MyQueuePage.jsx` wiring the Firestore query (`tires` where `researchQueue != null && researchQueue.resolvedAt == null`) + role gate + `QueueRow`.
3. Register `/my-queue` in `src/App.jsx` with the same protected-route pattern existing admin pages use.
4. Add the nav link with a count badge (pull the count from `useDashboardSignals().kylesQueueCount`, which Patch Q introduces).
5. Extend `AnalyticsPage.jsx` with the two tabs. Reuse whatever tab primitive the page already has.
6. Tests:
   - `QueueRow.test.jsx`: each action dispatches the right `onResolve` call; retail-wrong form validates the input (positive finite number required).
   - `MyQueuePage.test.jsx`: non-admin-non-sourcer redirect; rows render from a fixture; empty state renders when zero rows.

## Out of scope

- `/analytics?tab=margin-archive` advanced filters (date range, multi-field search) - deferred until real usage shows what is needed.
- Un-archive UI - deferred as above.
- Crew-widget "N in queue" pill for each user - handled in Patch R.
- Notifications / push when a new item enqueues - deferred.

## Validation

```
npm run lint
npm run test -- QueueRow
npm run test -- MyQueuePage
npm run test -- AnalyticsPage
npm run build
```

All must pass.

## PR title

`My Queue page + Analytics verification-queue and margin-archive tabs`

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
