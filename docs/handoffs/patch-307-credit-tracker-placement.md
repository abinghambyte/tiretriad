---
id: 307
title: Place CreditTrackerCard properly (own Ops tab or remove)
branch: credit-tracker-placement
depends_on: []
touches_shared:
  - src/pages/OpsPage.jsx
frontend_only: true
---

# Patch 307 — CreditTrackerCard placement

`<CreditTrackerCard />` currently renders at the top of every Ops tab in `compact` mode. The audit flagged this as cluttered: it dilutes both the credit info and the active tab. Decision: give it its own Ops tab so it has a real home.

## Branch

`credit-tracker-placement`

## Scope

**Modify:**
- `src/pages/OpsPage.jsx` — remove the always-visible CreditTrackerCard render at the top of the page, add a new Ops tab `credit` (or `overview`) that renders the card in non-compact mode

## Design

Existing Ops tab IDs are stored in the constant array near the top of the page. Read it first, then:

1. Add `'credit'` (or `'overview'`) to the tabs array
2. Add a label for the new tab
3. Add a subtitle if your tab system uses subtitles
4. Render the CreditTrackerCard inside the new tab's conditional block, full-size (drop the `compact` prop)
5. Remove the old top-of-page render

Make the new tab the **default** if Credit is the most-frequently-checked thing, OR keep `expenses` as default and let `credit` be a sibling. Default is your call — pick what matches your daily workflow.

**Suggestion:** keep `expenses` as default; add `credit` as the rightmost tab.

## Tasks

- [ ] `cd` worktree, `npm ci`
- [ ] Read `src/pages/OpsPage.jsx` to understand:
  - The tab array constant (likely `OPS_TAB_IDS`)
  - The label / subtitle constants
  - Where the page-level CreditTrackerCard renders
  - Where each tab's conditional block lives
- [ ] Add the new tab ID, label, subtitle
- [ ] Move CreditTrackerCard from top-of-page to inside the new tab block (drop the `compact` prop)
- [ ] If existing tests assert CreditTrackerCard renders on every visit, update them to deep-link to the credit tab
- [ ] Verify lint / test / build
- [ ] Single commit: `Ops: give CreditTrackerCard its own tab instead of rendering above every other tab`
- [ ] Open PR

## Out of scope

- Refactoring CreditTrackerCard itself
- Adding new credit-related metrics
- Restructuring the rest of OpsPage

## Validation

```
npm run lint
npm run test
npm run build
```

## PR title

`Ops: give CreditTrackerCard its own tab`

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
