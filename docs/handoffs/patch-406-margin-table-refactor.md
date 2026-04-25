---
id: 406
title: MarginTable desktop-path refactor (Option D — last; do NOT touch mobile cards)
branch: refactor-margin-table
depends_on:
  - 405
touches_shared:
  - src/components/tires/MarginTable.jsx
frontend_only: true
---

# Patch 406 — MarginTable desktop refactor (Option D)

**READ FIRST:**
- `BATCH-10-PATTERN.md` in this directory
- The patch-401 / 402 PR diffs (the references)
- `docs/superpowers/audits/2026-04-25-partial-diff-investigation.md` (explains why react-window virtualization is incompatible with semantic `<table>` and constrains this refactor)

This is the **highest-risk patch in Batch 10.** Two specific guardrails on top of the standard pattern.

## Branch

`refactor-margin-table`

## Scope

`src/components/tires/MarginTable.jsx` (1275 lines) is the largest single component in the codebase. It owns: virtualized list (react-window), inline CTS editor, sort buttons (header), mobile horizontal-scroll cards, bulk-selection wiring, copy-to-clipboard helpers, listing status badges.

Refactor target shape (DESKTOP path only):

```
src/utils/marginTableSelectors.js
  selectColumnVisibility(prefs)
  // pure derivations specific to the table; if generic, fold into tireSelectors.js
src/utils/marginTableSelectors.test.js

src/components/tires/useMarginTable.js
  Sub-hooks:
    useMarginSort()      (column sort key + direction)
    useCtsEditor()       (which row's CTS is in inline-edit mode)
    useColumnVisibility() (which optional columns show)
src/components/tires/useMarginTable.test.js

src/components/tires/MarginTable.jsx           ← thin shell, ~150 lines
src/components/tires/MarginTableHeader.jsx     ← sort buttons + column toggle popover
src/components/tires/MarginRow.jsx             ← one virtualized row (DESKTOP)
src/components/tires/CtsInlineEditor.jsx
src/components/tires/ListingStatusBadge.jsx
```

## Specifics for this page — TWO HARD CONSTRAINTS

### C1 — DO NOT touch the mobile cards path

The mobile horizontal cards (the block conditioned on `isMobileTable`) are battle-tested and shipped. **Do not extract or move them in this patch.** If you find inline mobile-card JSX inside `MarginTable.jsx`, leave it alone. The desktop refactor and mobile path coexist.

If you find that the mobile-card block is genuinely orphaned and should be deleted (because tonight's PR-1 work moved mobile to `<TireCardMobile>` outside MarginTable), THAT'S A SEPARATE PATCH, not this one. Verify by grep before assuming.

### C2 — react-window grid-layout invariant

`MarginTable` uses `react-window`'s `<List>` for virtualization. Each virtualized row is a `display: grid` row whose `gridTemplateColumns` MUST exactly match the header's `gridTemplateColumns`. If they diverge by a single value, columns visually misalign and the table is broken.

The previous attempt to convert this to a semantic `<table>` failed for exactly this reason (see `docs/superpowers/audits/2026-04-25-partial-diff-investigation.md`). When you extract `<MarginTableHeader>` and `<MarginRow>`, **share a single `gridTemplateColumns` constant** between them so they cannot drift:

```js
// In MarginTable.jsx or a shared constants file
const COLUMN_GRID = 'minmax(0,180px) 80px 96px ...'   // example

// In MarginTableHeader.jsx
<div className={`grid items-center`} style={{ gridTemplateColumns: COLUMN_GRID }}>

// In MarginRow.jsx
<div className={`grid items-center`} style={{ gridTemplateColumns: COLUMN_GRID }}>
```

Add a unit / integration test asserting both consume the same constant.

After implementing, **run a visual diff manually** at desktop width:
- Header columns align with row columns ✓
- No horizontal jitter when scrolling
- Sort caret appears on the right column it labels

If `npm run test:visual` flags the desktop tires snapshot as diffed: inspect the actual diff. If it's just opacity / spacing drift you can accept, regenerate baselines. If it's column misalignment, the grid invariant broke and you need to fix the extraction before merging.

## Process

1. `cd` worktree, `npm ci`
2. Read `BATCH-10-PATTERN.md`, the patch-405 PR diff (your reference for the shell side), `MarginTable.jsx` in full
3. Extract `COLUMN_GRID` first as a shared constant
4. Extract `<MarginTableHeader>` taking the constant + sort props
5. Extract `<MarginRow>` taking the constant + tire + handlers
6. Extract `<CtsInlineEditor>` and `<ListingStatusBadge>` as pure leaves
7. Move sort / cts-edit / column-visibility state into `useMarginTable.js` (with sub-hooks if needed)
8. Rewrite `MarginTable.jsx` shell to wire the hook into the subcomponents
9. Verify lint / test / build / G1 caps
10. Run `npm run test:visual` and inspect any tires-desktop diffs carefully
11. Open PR titled: `Refactor MarginTable desktop path into hook + selectors + subcomponents (Option D)`

## Acceptance criteria

Same as patch-401. Plus:
- The shared `gridTemplateColumns` constant is referenced by both header and row components (verifiable by grep)
- Visual diff on tires-desktop snapshot reflects only intended changes (no misalignment)
- Mobile cards path remains visually unchanged (run mobile snapshots as a regression check)
- All sub-hooks satisfy G1
- Inline CTS editor still works (open / type / save / cancel) — write a renderHook test for `useCtsEditor`'s state transitions

## Out of scope

- Mobile cards (`<TireCardMobile>` from PR-1; lives outside MarginTable)
- Converting MarginTable to a semantic `<table>` (architecturally infeasible per audit)
- Removing the suppressed-then-now-removed ARIA attributes (already lifted in PR #147)
- Touching `MarginFilters.jsx` if it exists (separate concern; out-of-scope)

## Validation

```
npm run lint
npm run test
npm run build
npm run test:visual
```

After merge, trigger `Visual tests - update Linux baselines` workflow_dispatch and merge the bot PR.

## PR title

`Refactor MarginTable desktop path into hook + selectors + subcomponents (Option D)`

Execute this brief exactly. Branch from main (after 405 has merged), run all validation commands before opening the PR, and stop after the PR is open.
