# Test flake investigation: advisorNarrate + usePayoutConfig

Date: 2026-04-25
Branch: `investigate-test-flakes`
Vitest: 4.1.4 (default `pool: 'forks'`, file-parallel)
Suite size: 55 files / 531 tests

## Reproduction

Could not reproduce after 13 consecutive full-suite runs (`npm run test`), plus one serial run (`npx vitest run --no-file-parallelism`). All passed in 21-23s parallel / 57s serial. Reported intermittence is real per the Cursor agent reports, but it does not surface on this machine in this run window. Hypotheses below are based on static analysis of the two test files and their neighbors.

Confidence in root cause: **medium** for `usePayoutConfig`, **medium** for `advisorNarrate`. Both have plausible internal race/timeout shapes that do not require cross-file pollution to fail; that matches "passes in isolation, fails sometimes under load" because load itself shifts the timing.

## Hypothesis 1 — `usePayoutConfig.test.js` flushMicrotasks is too short

File: `src/hooks/usePayoutConfig.test.js`
Hook under test: `src/hooks/usePayoutConfig.js`

The three async tests (`exposes the doc data...`, `returns config: null...`, `surfaces snapshot listener errors`) follow this shape:

```js
onSnapshotMock.mockImplementation((_ref, onNext) => {
  queueMicrotask(() => onNext({ exists: () => true, data: () => ({ marginFloorPct: 25 }) }))
  return () => {}
})

const hook = renderHook(() => usePayoutConfig())
hook.mount()
await hook.flushMicrotasks()           // <-- single `await Promise.resolve()`
expect(hook.result.loading).toBe(false)
```

`flushMicrotasks` only awaits one microtask tick:

```js
async flushMicrotasks() {
  await act(async () => { await Promise.resolve() })
}
```

The chain that has to drain inside that single tick:
1. `queueMicrotask` callback fires the snapshot
2. `setConfig` / `setLoading(false)` schedule a React update
3. React (concurrent root) commits via `MessageChannel` / microtask, depending on jsdom polyfills
4. `Probe` re-renders, `result.current` is updated

In React 18+ concurrent rendering, scheduler work is dispatched through `MessageChannel` (a macrotask), not a single microtask. With `act(async)` it usually flushes, but if the worker is under contention or the jsdom `MessageChannel` polyfill behaves differently, one `Promise.resolve()` await can return before the commit lands. The hook then still reads `loading: true`, exactly the symptom reported.

This is **not** cross-file pollution; it is an under-flushed async test that is timing-fragile and gets unmasked when the worker is busy under full-suite load. That neatly explains "passes in isolation, fails under full run."

### Recommended fix (smallest, safest)

Drain microtasks AND the React scheduler. Two cheap options; option A is the most idiomatic and is what `@testing-library/react`'s `waitFor` does internally:

Option A — `waitFor` on the assertion:

```js
import { waitFor } from '@testing-library/react'
// ...
hook.mount()
await waitFor(() => expect(hook.result.loading).toBe(false))
```

Option B — beef up the helper:

```js
async flushMicrotasks() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    // Yield to the macrotask queue so React's MessageChannel scheduler runs.
    await new Promise((r) => setTimeout(r, 0))
  })
}
```

Diff (option B, applied to `src/hooks/usePayoutConfig.test.js` lines 41-45 and same shape in `src/hooks/useFirestoreQuery.test.js`):

```diff
   async flushMicrotasks() {
-    await act(async () => {
-      await Promise.resolve()
-    })
+    await act(async () => {
+      await Promise.resolve()
+      await Promise.resolve()
+      await new Promise((r) => setTimeout(r, 0))
+    })
   },
```

Same pattern exists in `src/hooks/useFirestoreQuery.test.js` (a copy of the same `renderHook` helper) — fix both for consistency.

## Hypothesis 2 — `advisorNarrate.test.mjs` re-requires firebase-admin five times under load

File: `functions/advisorNarrate.test.mjs`

Each test calls:

```js
async function load(firestore) {
  vi.resetModules()
  delete require.cache[require.resolve('./advisorNarrate.js')]
  const mod = require('./advisorNarrate.js')
  // ...
}
```

`advisorNarrate.js` synchronously `require`s `firebase-functions/v2/https`, `firebase-admin`, and `./slackSecrets`. `firebase-admin` is heavy and pulls in a large dependency graph. Re-requiring it 5 times in a single file (once per test) is genuinely slow on a busy worker. Default vitest test timeout is 5000ms; each `load()` triggers a module re-require. If the worker is already saturated by parallel jsdom test files (the suite has 23 jsdom files alongside 12 functions tests), a single test crossing 5s is the exact symptom reported.

Note: only `advisorNarrate.test.mjs` does `vi.resetModules()` + `require.cache` invalidation in the entire `functions/` tree — the other 11 functions tests do not. That makes this file the unique outlier.

The cache reset is also probably unnecessary — `handle()` is a pure factory that takes `firestore`, `now`, and `callGemini` as injected dependencies. Nothing in `advisorNarrate.js` carries module-level state that needs resetting between tests. The `vi.resetModules()` call appears to be cargo-culted defensive code.

### Recommended fix

Drop the per-test module reload. Require once at the top of the file:

```diff
-import { createRequire } from 'node:module'
 import { describe, it, expect, vi, beforeEach } from 'vitest'
-
-const require = createRequire(import.meta.url)
+import { createRequire } from 'node:module'
+
+const require = createRequire(import.meta.url)
+const { _testonly } = require('./advisorNarrate.js')

 const geminiMock = vi.fn()
 const now = new Date('2026-04-23T12:00:00Z').getTime()
 // ... makeFirestoreStub unchanged ...

-async function load(firestore) {
-  vi.resetModules()
-  delete require.cache[require.resolve('./advisorNarrate.js')]
-  const mod = require('./advisorNarrate.js')
-  const make = await mod._testonly.handle({ firestore, now, callGemini: geminiMock })
-  return make
-}
+async function load(firestore) {
+  return _testonly.handle({ firestore, now, callGemini: geminiMock })
+}
```

This eliminates the 5x firebase-admin re-require, removing the timeout pressure entirely. If the test author had a real reason for the reset (e.g., paranoia about a future module-level cache), bumping the per-test timeout is a safer fallback:

```js
it('returns cached narrative when cache entry is < 24h old', async () => { /* ... */ }, 15000)
```

…but the right fix is to drop the reset.

## Other observations (not load-bearing for this flake, but worth noting)

- `src/lib/presenceHeartbeat.test.js` does use `vi.useFakeTimers()` with proper `vi.useRealTimers()` in `afterEach`. Clean.
- `src/components/dashboard/TopSellersCard.test.jsx` does NOT call `vi.useFakeTimers()` in `beforeEach` — only inside two specific tests, with `vi.useRealTimers()` in `afterEach`. That is correct and not a leak source.
- `src/components/layout/CommandPalette.test.jsx` uses fake timers globally with proper restoration. Clean.
- 7 test files mock `firebase/firestore` differently. `vi.mock` is hoisted and file-scoped in vitest 4 — these do not pollute each other across files. No action needed.
- `vitest.config.js` is bare-bones (`environment: 'node'`, no `pool` override, no `isolate` setting, no `setupFiles`). Defaults are fine; no config tweak recommended.

## Recommended next step

Ship as a separate, small PR titled "fix(tests): stabilize usePayoutConfig + advisorNarrate flakes" with two commits:

1. `test(hooks): drain React scheduler in renderHook flush helper` — fix `usePayoutConfig.test.js` and `useFirestoreQuery.test.js` (same pattern).
2. `test(advisor): drop unnecessary module reset in advisorNarrate test` — collapse `load()` to a thin wrapper, remove `vi.resetModules`.

No broader cleanup needed. The vitest config itself is fine. Both changes are local, behavior-preserving, and reduce timing fragility.

If the flake recurs after this fix, escalate to enabling `--no-file-parallelism` for CI as a temporary band-aid while a deeper investigation runs, but that should not be the first move.
