# Dashboard onboarding consolidation — design spec (STORMED 2026-04-27)

**Status:** Stormed. Implementation captured as `docs/handoffs/patch-627-homepage-module-grid.md`. Note: this patch is the same work originally listed as **patch-600b** in the comprehensive UI/UX audit triage table.

## Problem

Two related issues from prior audits:

- **Audit §2.1** — Home shows 5 separate empty-state KPI widgets (Pending Orders / Top Sellers / Last Sale / Total Profit / Recent Activity). At zero data this is visual fatigue and hides what the user should actually do next.
- **Audit §0.1** — `docs/AI-CONTEXT.md` (lines 71–78) specifies a 6-card module grid (Skedaddle Tires / Rubber CRM / People Systems / Analytics / Growth Lab / Ops Command). The grid does not render today.

## Architectural decision

**The grid IS the onboarding.** Each module card has two presentations:
- **Empty state** — first-action CTA per module (e.g., "Crew of 1 — invite Kyle / DJ")
- **Data state** — live metric (e.g., "Crew of 3 · 12 customers")

This single surface replaces both the missing 6-card grid AND the 5 separate empty KPI widgets. Lowest cognitive load (one surface, not two), every empty state becomes actionable, grid becomes self-documenting.

## Stormed decisions

### Decision 1 — Threshold rule (hybrid)

| Card | Threshold source | Empty CTA | Live metric |
|---|---|---|---|
| **Skedaddle Tires** | per-card (`tires` count) | "1,160 tires loaded — open catalog" | "1,160 tires · X listings active · Y pending sales" |
| **Rubber CRM** | per-card (active `crmAccounts` count) | "0 leads — create your first" → opens NewLeadModal from patch-625 | "X leads · last touch Yd ago" |
| **People Systems** | per-card (`users` count > 1) | "Crew of 1 — invite Kyle / DJ" → opens existing invite flow | "Crew of X" or "Crew of X · Y customers" once customers > 0 |
| **Analytics** | global (`firstSaleAt` flag) | "Waiting for first sale" *(muted)* | "Today: $X · MTD: $Y · Total profit: $Z" |
| **Growth Lab** *(admin)* | global (`firstSaleAt`) | "0 experiments queued" | "X live · Y queued" |
| **Ops Command** *(admin)* | per-card (`meta/creditTracker` doc exists) | "Set credit limit" → credit tracker setup | "Credit: $X / $Y · Y reorder requests" |

**Rationale:** matches business reality. 1,160 tires exist before first sale; Analytics rightly waits. The global `firstSaleAt` flag is set the first time `runCompletionTransaction` (functions/financeStats.js) writes a completed order — single source of truth, doesn't drift.

### Decision 2 — Legacy KPI migration: absorb

Every existing KPI has a natural home in the new grid:

- **Pending Orders** → Tires card secondary line
- **Top Sellers** → Tires card live metric, single rotating row (existing `<TopSellersCard>` rotation logic preserved)
- **Last Sale + Total Profit** → Analytics card live metric
- **Recent Activity** → stays as own widget below the grid (no card home; orthogonal data)

After absorption, the Tires card live metric reads "1,160 tires · X listings active · Y pending sales" and the Analytics card reads "Today: $X · MTD: $Y · Total profit: $Z". Denser but scannable.

The 5 separate widget components don't get deleted in this PR — they're either kept (Recent Activity) or their *content* is rendered inside the new module cards while the old wrapper components are removed from `<Dashboard>`. Cleanup of orphan widget files is a follow-up patch once the new layout is verified stable.

### Decision 3 — Layout (auto-fit responsive grid)

```css
/* Tailwind arbitrary value, applied to the grid container */
grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4 max-w-6xl
```

Handles every viewport AND every role variant (4 cards for non-admin, 6 for admin) without bespoke media queries. Auto-collapses:
- Wide desktop: 3 columns × 2 rows
- Tablet / narrow desktop: 2 columns × 3 rows
- Phone: 1 column × N rows (cards stack)

Cap minimum tile width at 280px so cards don't compress past readability. Container max-width 6xl matches existing portal width convention.

### Decision 4 — Existing widgets below the grid: keep as-is for ship

Order on home: 6-card module grid → Recent Activity / Hidden Gems / Next to Post → ActivityTicker.

Don't change two things at once. Grid + KPI absorption is the architectural change. The four existing widgets stay where the crew expects them. "Tuck behind a 'Show details' expand" is the right follow-up if the home page still feels cluttered after this lands.

### Decision 5 — Rollout: big-bang

No feature flag. Crew is 3 people; regression risk is low; flag-management overhead is disproportionate. Document the change in `#fleet-ops` the day of merge. If Kyle or DJ flag UX issues, they're a Slack message away.

### Decision 6 — Regression coverage: snapshots + manual

The KPI absorption (decision 2) is the riskiest part — easy to mis-wire "Top Sellers" into the Tires card or drop a decimal on Total Profit. Manual verification with the actual numbers in front of you is the only way to catch arithmetic regressions. Snapshot tests catch structural drift.

**PR description checklist (mandatory):**

- [ ] Visited `/home` as admin, supplier, mechanic. Confirmed all 6 cards render correct empty/data state per role.
- [ ] Verified Today / MTD / Total profit numbers match pre-merge values from legacy widgets.
- [ ] Confirmed mobile reachability of all visible cards at 375px and 414px widths.
- [ ] Confirmed admin-only Growth Lab + Ops Command cards do NOT render for non-admin roles.
- [ ] Confirmed Recent Activity widget below the grid still renders correctly.

## Out of scope

- Tucking the four existing below-grid widgets behind a "Show details" expand (deferred follow-up)
- Cleaning up orphan widget components from `src/components/dashboard/` (followup once layout is stable)
- A11y review of the new grid (separate pass; standard heading + landmark conventions apply)
- Animations/transitions for empty→data state flip (initial ship is hard cut-over on data threshold cross)

## Decision log

- **Grid IS the onboarding** — single surface replaces missing grid + empty KPIs; rejected separate "Getting Started" module + grid as two competing surfaces
- **Hybrid threshold** — per-card for inventory/CRM/People (data exists pre-revenue); global `firstSaleAt` for Analytics + Growth Lab (revenue-gated)
- **Absorb legacy KPIs into cards** — every metric has a natural home; Recent Activity is the orthogonal exception
- **Auto-fit grid with `minmax(280px, 1fr)`** — handles role-gated variants without media-query branching
- **Don't change widgets-below for ship** — grid + KPI absorption is the change; widget cleanup is follow-up
- **Big-bang rollout** — 3-person crew doesn't need a feature flag
- **Regression coverage = snapshots + manual checklist** — KPI absorption is arithmetic-sensitive

## Next step

Dispatch `docs/handoffs/patch-627-homepage-module-grid.md`. Single PR. Visual snapshots will need refresh post-merge per the established `visual-tests-update` workflow.
