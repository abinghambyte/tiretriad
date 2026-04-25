# Visual + a11y test suite

A thin Playwright suite that pins the chrome of five core routes and runs an
axe-core accessibility scan on each. Together these act as a regression net
for unintended UI drift and a floor for accessibility hygiene.

## What runs

- `routes.spec.ts` - takes a full-page screenshot of each route and compares
  it against the committed baseline. Catches layout shifts, missing styles,
  and accidental copy changes.
- `a11y.spec.ts` - injects axe-core and fails on `serious` or `critical`
  violations. Soft rules are listed in `axe-disabled-rules.json`.
- `setup.ts` - shared fixture: applies the DEV-gated auth bypass, aborts
  Firestore network calls, and waits for the route to settle before the
  assertion runs.

Each spec runs across three viewports defined as Playwright projects in
`playwright.config.ts`: `mobile-375`, `tablet-768`, and `desktop-1280`. So
the full matrix is 5 routes x 2 specs x 3 viewports = 30 tests.

## Running locally

```
npm run test:visual         # run the full suite headless
npm run test:visual:ui      # interactive UI mode (great for debugging)
npm run test:visual:update  # regenerate snapshots after intentional changes
```

The runner spins up a Vite preview server on port 4173. If you already have
something on that port, kill it first or set `PLAYWRIGHT_BASE_URL`.

## Regenerating baselines

Snapshots are platform-suffixed - Playwright stores them as `*-win32.png`,
`*-linux.png`, and `*-darwin.png` separately, because font hinting and
sub-pixel rendering differ enough between OSes to cause cross-platform
flake. CI runs Linux, so the `*-linux.png` baselines are the source of
truth for green builds.

After an intentional UI change:

- **On Linux:** run `npm run test:visual:update` and commit the new
  `*-linux.png` files.
- **On Windows or macOS:** trigger the
  `Visual tests - update Linux baselines` workflow (Actions tab ->
  workflow_dispatch). It runs the update on Linux and opens a PR with the
  regenerated baselines for review.

Local Windows or macOS contributors can also run
`npm run test:visual:update` to refresh their own platform's baselines if
they want to run the suite locally - those `*-win32.png` and `*-darwin.png`
files are checked in alongside the Linux ones.

## Auth bypass

The suite logs in via a build-flag-gated bypass at `src/firebase/testBypass.js`.
It activates when EITHER `import.meta.env.DEV` is true (local `npm run dev`)
OR `import.meta.env.VITE_E2E_BYPASS` is set (CI test builds), AND a
`skedaddle.test.bypassAuth` localStorage flag is set to `'1'`. Production
deploys never set the build flag, so the bypass code is dead-code-eliminated
from the production bundle entirely. The Playwright fixture in `setup.ts`
sets the localStorage flag via `addInitScript` before any page navigation.

CI builds with `cross-env VITE_E2E_BYPASS=1 npm run build` then `npm run preview`
so the bypass is reachable. See `playwright.config.ts` `webServer.command`.

## Playwright `--update-snapshots` tolerance-skip quirk

**If you regenerate baselines and the bot PR shows zero file changes**, you
may be hitting Playwright's tolerance-skip behavior. `--update-snapshots`
does NOT unconditionally rewrite baseline PNGs — when a fresh render is
within the configured `maxDiffPixelRatio` tolerance (1% by default in this
project), Playwright treats the existing baseline as still-valid and skips
the write, even when the new render is visibly different to a human.

This bit us once when PR-1's mobile chrome changes only landed in the
`tires-mobile-375-linux.png` baseline; the other four mobile routes' chrome
changes were within tolerance of the pre-PR-132 baselines and got skipped
silently. See `docs/superpowers/audits/2026-04-25-partial-diff-investigation.md`.

**The fix when this happens:** delete the platform-suffixed baselines first,
then run `--update-snapshots` to force a fresh write.

```sh
# Local Linux:
rm tests/visual/routes.spec.ts-snapshots/*-linux.png
npm run test:visual:update

# Local Windows / macOS:
rm tests/visual/routes.spec.ts-snapshots/*-win32.png   # or *-darwin.png
npm run test:visual:update
```

The `Visual tests - update Linux baselines` GitHub workflow does NOT
auto-delete first — if a manual run produces an empty PR, edit the
workflow to add a `rm` step before `npm run test:visual:update` for that
run, or do the delete + commit + push from a local Linux environment.

## Adding a new route

1. Add the path to the `ROUTES` array at the top of `routes.spec.ts` and
   `a11y.spec.ts`.
2. Run `npm run test:visual:update` to capture the initial baseline.
3. Commit the spec changes plus the new `*-linux.png`, `*-win32.png`, and
   `*-darwin.png` snapshot files.

If a route relies on data that changes per-run (timestamps, random IDs,
charts), wrap the volatile elements in a `data-test-mask` attribute and
extend `setup.ts` to mask them - otherwise the snapshot will flake.
