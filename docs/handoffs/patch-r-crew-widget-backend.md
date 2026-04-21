---
id: R
title: Crew widget v2 backend (presence + per-user signals)
branch: crew-widget-backend
depends_on: []
touches_shared:
  - src/hooks/useDashboardSignals.js
frontend_only: false
deploy:
  functions:
    - updatePresence
  firestore_rules: true
  scripts: []
---

# Patch R: Crew widget v2 backend (presence + per-user signals)

Branch: `crew-widget-backend`

Scope (files touched):

- `functions/presence.js` - NEW. Rate-limited `updatePresence` callable writing to `users/{uid}`.
- `functions/presence.test.mjs` - NEW. Rate limit, auth, payload validation.
- `functions/index.js` - export `updatePresence`.
- `src/lib/presenceHeartbeat.js` - NEW. Client heartbeat driver: 60s interval while visible, stops on Page Visibility hidden, resumes on visible, single-flight.
- `src/lib/presenceHeartbeat.test.js` - NEW. Fake timers + Page Visibility stubs.
- `src/hooks/useDashboardSignals.js` - add per-user pill signals (`crewSignals`) returning `{ [uid]: { wipCount, todayCompletions, streakDays, queueCount, lastSeenAt } }`. Existing signals untouched. NOTE: this file is also touched by Patch Q (different section - Patch Q removes `lowMargin` and adds `kylesQueueCount`). Merge Patch Q first; if this patch is cut from a Q-included base, the additions here compose cleanly.
- `src/hooks/useDashboardSignals.test.js` - extend (or create if absent) coverage for the new `crewSignals` derivation. Factor a pure `deriveCrewSignals(users, orders, tires, now)` sibling for testability.
- `src/components/dashboard/Dashboard.jsx` - wire one `useEffect` that starts the heartbeat on mount for the signed-in user. No visual change in this patch - the crew widget UI refresh is a follow-on (data contract stabilizes first).
- `firestore.rules` - allow `users/{uid}` to write its own `presence` subfield only (no client writes to role / email / other identity fields).

## Firestore schema changes

`users/{uid}` gains:

```
presence: {
  lastSeenAt: Timestamp,
  userAgent: string,      // short; truncated to 200 chars server-side
}
```

No migration needed; absent `presence` reads as "never seen."

## Tasks

1. **`updatePresence` callable** (`functions/presence.js`):
   - Auth required. Payload accepts optional `{ userAgent?: string }`.
   - Rate limit: reject with `HttpsError('resource-exhausted', ...)` if the caller's `users/{uid}.presence.lastSeenAt` is within the last 45 seconds. Server time comparison only; do not trust client timestamps.
   - On success, write `presence: { lastSeenAt: serverTimestamp(), userAgent: truncate(userAgent ?? '', 200) }` via merge.
   - Return `{ ok: true, lastSeenAt: <ISO string> }`.

2. **Client heartbeat** (`src/lib/presenceHeartbeat.js`):
   - Exports `startPresenceHeartbeat({ intervalMs = 60000 } = {})` returning a `stop()` function.
   - Fires `updatePresence` immediately on start, then every `intervalMs` while `document.visibilityState === 'visible'`.
   - Handles Page Visibility changes: pause on hidden, resume (with an immediate fire) on visible.
   - Single-flight: never overlaps two in-flight calls; if the interval fires while a call is pending, skip.
   - Swallows `resource-exhausted` errors silently (expected; the 45s rate limit collides with the 60s interval occasionally due to drift).
   - Logs other errors to `console.warn` with a namespaced prefix (`[presence]`) and keeps running.
   - Stops cleanly on `stop()` - clears the interval and removes the visibility listener.

3. **Dashboard wiring**: one `useEffect` in `Dashboard.jsx` that calls `startPresenceHeartbeat()` on mount and stops on unmount. Gated by `auth.currentUser` being present. No visual change.

4. **`crewSignals` selector**: in `useDashboardSignals.js`, add a pure `deriveCrewSignals(users, orders, tires, now)` fn returning a map keyed by uid:
   - `wipCount` - orders assigned to uid where `status` is an in-progress bucket (mirror the existing logic the app uses for WIP; if a helper exists, reuse it; otherwise derive from the same status list the rest of the dashboard uses).
   - `todayCompletions` - orders with `completedAt` within the current calendar day (local time per the app's convention) assigned to uid.
   - `streakDays` - count of consecutive prior days with at least one completion by uid; cap at 99. Reuse whatever streak math already exists in `AnalyticsPage.jsx` (`fieldStats` / `fieldStreakUi`) if cleanly extractable, else re-derive.
   - `queueCount` - for sourcer-role users only: count of tires where `researchQueue != null && researchQueue.resolvedAt == null`. For non-sourcers this is `0`. (Patch Q introduces the `researchQueue` field; if Q is not yet merged on base, default to `0` everywhere and add the live count in a follow-on.)
   - `lastSeenAt` - `users/{uid}.presence.lastSeenAt` or null.

5. **Tests**:
   - `presence.test.mjs`: unauthenticated rejected, rate limit enforced, happy path writes the right fields, userAgent truncated.
   - `presenceHeartbeat.test.js`: immediate fire on start, fires every 60s while visible, pauses on hidden, resumes on visible, single-flight, swallows resource-exhausted, stops cleanly.
   - `useDashboardSignals.test.js`: `deriveCrewSignals` correctly buckets each metric per uid given a fixture; absence of `presence` yields `lastSeenAt: null`; non-sourcer always gets `queueCount: 0`.

6. **Firestore rules**: allow `users/{uid}` update if `request.auth.uid == uid` AND the diff is only within `presence.*`. Deny otherwise. Keep existing read rules.

## Merge coordination note (important)

This patch and Patch Q both edit `src/hooks/useDashboardSignals.js`.

- Patch Q removes the `lowMargin` signal and adds `kylesQueueCount`.
- Patch R adds `crewSignals` (a map, disjoint from the top-level signals).

These touch different sections of the file and should merge cleanly. Prefer merging Patch Q first; if Patch R merges first, the Q author rebases and keeps both additions. If a conflict appears, resolve by keeping both. Do not regress Q's removal of `lowMargin`.

## Out of scope

- Crew widget visual redesign - the UI patch that consumes `crewSignals` and renders pills / online dots ships separately after this data contract is stable.
- Persisting user achievements or WIP badges in Firestore - v1 derives everything from existing docs.
- Real-time pub/sub presence (WebSocket / Realtime DB). Firestore polling is fine for v1 volume.
- Any touch to auth flows, sign-in, or user role management.

## Validation

```
cd functions && npm test -- presence
cd functions && npm run lint
cd .. && npm run lint
npm run test -- presenceHeartbeat
npm run test -- useDashboardSignals
npm run build
```

All must pass.

## Deploy note (include in PR body)

`firebase deploy --only functions:updatePresence` plus `firebase deploy --only firestore:rules` after merge.

## PR title

`Crew widget v2: presence heartbeat + per-user dashboard signals`

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
