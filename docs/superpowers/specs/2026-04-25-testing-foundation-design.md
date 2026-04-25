# Testing foundation — design spec

**Goal:** Build a CI safety net that catches the class of bugs we keep missing — visual regressions on mobile, accessibility violations, runtime errors in production. Establish the floor; expand later (see roadmap doc).

**Tier 1 scope (this PR):** Playwright + visual snapshots + axe-core on 5 routes × 3 viewports, plus Sentry. Nothing else.

## Why these specifically

Vitest tests use jsdom — no real layout, no paint, no stacking context. The April UI sweep flagged 10+ mobile bugs that all 480 unit tests missed because they're invisible to jsdom. Visual snapshots catch those automatically. axe-core catches a11y in the same pass. Sentry tells us when production users hit a runtime error we never reproduced.

## Architecture

### Playwright

- Browser: Chromium only for now (covers ~70% of users; Firefox/WebKit added in Tier 2 if budget permits)
- Viewports: 375×667 (mobile), 768×1024 (tablet portrait), 1280×800 (laptop)
- Routes covered:
  - `/` (Dashboard)
  - `/tires` (Tires catalog)
  - `/orders` (Orders list)
  - `/people?tab=crew` (People crew tab)
  - `/crm` (CRM landing)
- Auth: tests log in as a fixture admin user via a custom `login()` helper that sets the auth state once per test file. Service-account-backed; uses Firebase Auth emulator OR a sandbox project.
- Storage: snapshots committed to `tests/visual/__snapshots__/` so diffs show up in PRs.

### Visual snapshots

- Per route, per viewport: 1 full-page screenshot
- Tolerance: `maxDiffPixelRatio: 0.01` (1% of pixels can differ — covers anti-aliasing without permitting real bugs)
- Update workflow: `npm run test:visual:update` regenerates snapshots; CI fails when diffs exceed threshold.

### axe-core

- Library: `@axe-core/playwright`
- Run: once per route × viewport (15 runs total)
- Severity: fail CI on `serious` or `critical`; warn on `moderate`
- Configurable rule disable list lives at `tests/visual/axe-disabled-rules.json` so we can suppress known issues that need design follow-up without blocking ship.

### Sentry

- Frontend SDK: `@sentry/react`
- Init: in `src/main.jsx`, only when `import.meta.env.PROD === true`
- Source maps: uploaded by Vercel build hook
- Sampling: 100% errors, 10% performance traces (free-tier-friendly)
- DSN: stored in `VITE_SENTRY_DSN` env var (Vercel project setting)

## File structure

```
tests/
  visual/
    setup.ts                       # auth helper, viewport configs
    routes.spec.ts                 # the 5 routes × 3 viewports = 15 tests
    a11y.spec.ts                   # axe-core scans on the same surfaces
    axe-disabled-rules.json        # explicit list of rules we're triaging
    __snapshots__/                 # baseline screenshots
playwright.config.ts               # 1 project (Chromium), 3 viewports
.github/workflows/visual-tests.yml # runs on every PR
src/main.jsx                       # adds Sentry init
src/sentry.js                      # Sentry config + helper
.env.example                       # documents VITE_SENTRY_DSN
```

## CI integration

- Workflow: `.github/workflows/visual-tests.yml`
- Triggers: `pull_request` (any branch → main) + `push` to main
- Steps: install → build → start preview server → playwright run → upload snapshot diffs as artifacts
- Cache: Playwright browsers cached by hash of `package-lock.json`
- Runtime budget: ≤ 5 min per CI run

## Failure modes + handling

- **Snapshot diff:** PR is annotated with a side-by-side image. Reviewer judges whether to accept (run `update`) or reject (fix code).
- **axe violation:** PR fails with the rule name + selector + impact. Fix or add to disabled-rules with a written justification.
- **Sentry config missing in dev:** silent — SDK is gated behind `import.meta.env.PROD`.

## Out of Tier 1, deferred to roadmap

- Lighthouse CI (perf budgets) — Tier 2
- Argos / Percy / Chromatic for managed visual review UI — Tier 2
- Storybook component-level visual tests — Tier 3
- Multi-browser (Firefox / WebKit) — Tier 2
- Mobile-emulation device profiles (iPhone 14 Safari, Pixel 7 Chrome) — Tier 2

See `docs/superpowers/audits/2026-04-25-testing-foundation-roadmap.md`.

## Risk

- **Auth fixture in CI is the biggest risk.** Using the real Firebase Auth in CI requires emulator or a dedicated test project. Mitigation: start with the emulator, fall back to a service-account workaround if emulator latency is bad.
- **Snapshot flakiness from animations.** Mitigation: globally `prefers-reduced-motion: reduce` in test runs; pause the activity ticker via `data-test-no-anim` flag.
- **Snapshot drift.** Mitigation: baselines are reviewed and intentionally updated when design changes. Don't auto-accept.
