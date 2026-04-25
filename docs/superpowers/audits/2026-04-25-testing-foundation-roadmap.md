# Testing foundation roadmap

Tier 1 (Playwright + visual snapshots + axe-core + Sentry) ships in PR-A. This doc tracks what comes next, ordered by ROI.

## Tier 2 — perf + speed insights (next)

**Trigger to start:** PR-A has caught at least one real regression (~2 weeks of normal PR cadence).

- **Lighthouse CI** with mobile + desktop preset, perf + a11y budget enforcement per route. Free GitHub Action. ~2 hours setup.
  - Targets: LCP < 2.5s mobile, CLS < 0.1, a11y score ≥ 90 per route.
- **Vercel Speed Insights** (`@vercel/speed-insights`) for real-user Core Web Vitals from production. ~30 min, drop-in.

## Tier 3 — managed visual review

**Trigger:** when we hit ~30 visual snapshots and triaging diffs by hand becomes painful.

- **Argos** (open-source-friendly) for a hosted UI to triage snapshot diffs across PRs. ~$0–50/mo for our scale. ~1 hour setup.
- Alternative: Chromatic if we eventually adopt Storybook.

## Tier 4 — component-level tests

**Trigger:** when we have 15+ reusable UI components (likely after the brand-bolt + mobile-redesign work).

- **Storybook** with viewport + accessibility addons.
- **Chromatic** for component-level visual regression on every story variant.

## Tier 5 — multi-browser + device profiles

**Trigger:** when we have real users on Safari iOS and want confidence we're not shipping Chrome-only fixes.

- Add Firefox + WebKit projects to `playwright.config.ts`.
- Add device profiles: iPhone 14 Pro (Safari), Pixel 7 (Chrome), iPad Pro (Safari) instead of generic viewport sizes.
- Cost: CI runtime grows linearly. Mitigation: run multi-browser only on `push` to main, not every PR.

## Tier 6 — product analytics

**Trigger:** when we need to know which routes get hit, on which devices, and what bounces.

- **PostHog** (open source, self-hostable) or **Plausible** (privacy-first, paid).
- Use to inform what to test next, what to deprecate, and where mobile traffic actually goes.

## Process additions (parallel, low effort)

These are dispatchable to Cursor agents now (see `docs/handoffs/patch-101..105`):

- PR template with mobile / a11y / performance checkboxes
- CODEOWNERS auto-routing chrome/auth/data-model changes to admin review
- `eslint-plugin-jsx-a11y` for static a11y catches at lint time
- `size-limit` config to fail PRs that grow the bundle past thresholds
- Quarterly audit cron that produces `docs/superpowers/audits/YYYY-MM-DD-auto-audit.md` from a Playwright + axe + Lighthouse run on production

## Decision log

- **Why Chromium-only in Tier 1?** ~70% of users; getting CI green on three engines simultaneously triples the cost without commensurate value while we have zero coverage.
- **Why no Storybook yet?** We don't have a real component library yet — most components are still page-coupled. Storybook is high-leverage once that's not true.
- **Why not Cypress?** Playwright has better mobile-emulation primitives, faster on the same hardware, and ships visual-snapshot APIs natively. Cypress's plugin ecosystem is bigger but for our needs Playwright is enough.
- **Why Sentry over Bugsnag/Honeycomb/Rollbar?** Free tier is generous at our scale, source-map upload is automatic on Vercel, and the React SDK is mature. Switching cost is low if we outgrow it.
