# Tires page + Dashboard Hidden Gems redesign — design spec

**Date:** 2026-04-27
**Branch:** `tires-hiddengems-redesign`
**Status:** Design approved (via design-critique + revision in session); awaiting plan generation.

## Goal

Resolve three coordinated UX issues across the Tires catalog page and the Dashboard Hidden Gems surface, without expanding scope into unrelated cleanup.

## Background

Across the previous UI review series (PRs A–F), consistency fixes shipped across all modules. Three issues remained that needed targeted, deliberate redesign rather than incremental polish:

1. **Hidden Gems on the Dashboard** rendered up to 5 rows inline. The user wanted a single high-signal preview row plus a path to bulk-act on the full list. The original instinct was to collapse to 1 row + "Show more" modal, but design critique showed this destroyed at-a-glance triage value. Final design: **3 rows inline** + "Show more" → bulk-select modal.
2. **Tires filter panel** opens inline and pushes the catalog table down by ~120 px on mobile, ~80 px on desktop. The layout shift is jarring and breaks scroll position. Solution: convert to a fixed-position overlay anchored dynamically below the sticky toolbar.
3. **Tires catalog UX clutter:** five sub-issues — a redundant `<TopOpportunities>` widget, the Select All checkbox buried in the table header, weak column-header contrast, the visual disconnect between sticky toolbar and table, and a separate `<FilterPresetsBar>` card that duplicates filter ownership.

## Non-goals

- Redesigning the catalog row layout itself (that's the patch-629 series)
- Touching the listing-advisor flow
- Changing margin pill thresholds or coloring
- Mobile bottom-nav changes
- Adding new filters or sort options

## Architecture

### Three independent surfaces, two shared component patterns

The redesign touches three surfaces:

- **Dashboard → `HiddenGemsSurface`** (1 file): inline preview + bulk-action modal
- **Tires page → `TiresDashboard`** (orchestrator): sticky toolbar, filter overlay, two-stage Select All, visual fusing
- **Tires page → `MarginFilters`** (filter panel): absorbs `FilterPresetsBar` logic; deletes the standalone bar
- **Tires page → `MarginTable`** (table body): stronger header contrast; remove header-row Select All checkbox

Shared patterns reused (do not invent new ones):

- **Modal chrome** from `src/components/ui/modalChrome.js` (`MODAL_CENTER_BACKDROP`, `MODAL_CENTER_PANEL_WIDE`)
- **Stacking order** documented in `src/index.css` (overlay z-[120], modal z-[130])
- **44×44 tap targets** on every new control per WCAG 2.5.5 AAA
- **Tailwind tokens only** — no raw hex; theme remap handles light/dark via `[data-theme='light']`

### Component boundaries

| Surface | Responsibility | Inputs | Outputs / side effects |
|---|---|---|---|
| `HiddenGemsSurface` (existing, modified) | Render 3-row preview; manage own modal state, focus trap, bulk post | `list: Gem[]`, `onPost?: (id) => Promise<void>`, `toast` (existing pattern) | Renders inline rows + optional modal; calls `onPost` per selected id; emits success/partial-failure toast |
| `TiresDashboard` (existing, modified) | Orchestrate sticky toolbar, filter overlay positioning, two-stage selection state, visual fusing | (existing — no new props) | Mounts MarginFilters in overlay; passes `onApplyPreset` |
| `MarginFilters` (existing, modified) | Render filter chip rows + saved-filter section (newly absorbed) | New: `onApplyPreset(preset)` (other props already exist) | Calls `onApplyPreset` when user loads a preset |
| `FilterPresetsSection` (new, private to MarginFilters.jsx) | localStorage-backed preset save/load UI | `{brand, useTagFilters, lrFilters, minMargin, needsReposting, onApplyPreset}` | Reads/writes `skedaddle-tire-margin-presets-v1`; calls `onApplyPreset` |
| `FilterPresetsBar` (existing) | — | — | **Deleted.** Logic absorbed by `FilterPresetsSection`. |

## Detailed design

### 1. Hidden Gems redesign

#### Inline preview
- `list.length === 0`: render nothing (existing behavior preserved)
- `list.length >= 1`: render up to 3 rows (`list.slice(0, 3)`)
- `list.length > 3`: render a "Show more (N more)" ghost button below the rows. Visual weight: `text-amber-300 hover:bg-zinc-800/60` (matches `MyQueueBell` footer).

#### Modal
- Mount with `MODAL_CENTER_BACKDROP` + `MODAL_CENTER_PANEL_WIDE` (existing exports from `src/components/ui/modalChrome.js`)
- Header: `Hidden Gems (N)` heading + 44×44 close button
- Body: scrollable `<ul>` with one row per gem, each prefixed by a checkbox
- Footer: "X selected" status + Cancel + Post selected (X) CTA

#### State
- `modalOpen: boolean` (default false)
- `modalSelected: Set<string>` (default empty; cleared on close)
- `posting: boolean` (true during async post; disables CTA)

#### Behavior
- Open → focus moves to first focusable inside modal; previous focus saved
- Tab cycles within modal (focus trap implementation listed in plan)
- Escape closes; previous focus restored
- Backdrop click closes; panel click `stopPropagation()` so it doesn't bubble
- Post selected: `Promise.allSettled` over selected ids → toast summary (`"N posted"` or `"X posted, Y failed"`); modal closes; selection clears
- CTA disabled when `modalSelected.size === 0` OR `posting === true`

#### Accessibility
- `role="dialog" aria-modal="true" aria-labelledby={headingId}` (heading uses `useId()`)
- Each checkbox has `aria-label="Select <gem.label>"` (descriptive, not "checkbox 1")
- Close button: `aria-label="Close"`, 44×44 hit area
- Focus trap: hand-rolled in `HiddenGemsSurface.jsx` unless an existing hook in `src/hooks/` already provides one (check `Popover.jsx` first)

### 2. Tires filter overlay

#### Positioning
- Anchored dynamically: read sticky toolbar's `getBoundingClientRect().bottom`, add 4px gap, set as inline `top` style
- Recompute on `resize` events while overlay is open
- `position: fixed; left-4 right-4 sm:left-6 sm:right-6 z-[120]`
- `max-h-[80vh] overflow-y-auto` so tall filter content remains scrollable on short viewports

#### Backdrop
- Separate `<div>` at `fixed inset-0 z-[120] bg-black/20`
- Click anywhere outside panel → close (does not bubble through stop-propagation on panel)

#### Close affordances
- Backdrop click
- Explicit close button in panel header: 44×44, `aria-label="Close filters"`
- Escape key while overlay open

#### Implementation pattern
```jsx
const toolbarRef = useRef(null)
const [overlayTop, setOverlayTop] = useState(0)

useLayoutEffect(() => {
  if (!filtersOpen || !toolbarRef.current) return
  const measure = () => {
    if (!toolbarRef.current) return
    setOverlayTop(toolbarRef.current.getBoundingClientRect().bottom + 4)
  }
  measure()
  window.addEventListener('resize', measure)
  return () => window.removeEventListener('resize', measure)
}, [filtersOpen])
```

(Use `useLayoutEffect` not `useEffect` to avoid one-frame flash.)

#### Z-index discipline
- Overlay backdrop + panel: z-[120] (popover layer per `src/index.css` stacking comment)
- The in-panel preset menu (also a Popover) must remain clickable; verify during implementation. If popovers stack incorrectly, bump panel to z-[125] but document the deviation.
- Modal layer (z-[130]) sits above. Hidden Gems modal is unaffected.

### 3. Tires sticky toolbar

#### Two-stage Select All

Replace the existing "None selected / N selected" text + the table-header checkbox with a single toggle button + optional secondary link.

State derived in `TiresDashboard`:
```js
const pageRows = sortedRows  // adjust if a virtualization slice exists
const visibleSelected = pageRows.length > 0 && pageRows.every(r => selectedIds.has(r.id))
const allMatchingSelected = sortedRows.length > 0 && sortedRows.every(r => selectedIds.has(r.id))
const moreBeyondVisible = sortedRows.length > pageRows.length
```

Button label by state:
- Default (none selected): `"Select page (N)"`
- After first click (page selected): `"N selected"` + sibling link `"Select all M matching"` (only if `M > N`)
- After "select all matching" (all selected): `"Deselect all (M)"`
- Mid-state (partial): treat as "default" — first click selects page

Styling:
- Default: `border-zinc-600 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-900/60`
- Active (any selected): `border-amber-600 bg-amber-950/40 text-amber-100 hover:bg-amber-950/60`
- Always: `min-h-[44px] sm:min-h-0` for mobile tap targets
- `aria-pressed={visibleSelected}` reflects toggle state

If pagination doesn't exist (tires catalog renders all `sortedRows`), the secondary link never appears — that's fine. The two-stage button still gives count-before-action signal.

#### Remove `<TopOpportunities>`

Delete the JSX block. Run `grep -rn "TopOpportunities" src/` first; if no other consumers, delete the import line. Do NOT delete the component file (it may be reused later).

#### Visual fuse: toolbar → table

Today: sticky toolbar has `rounded-xl border border-zinc-800`. MarginTable has its own border. Visible gap between them.

Target: one card edge.

- Sticky toolbar className changes: `rounded-xl` → `rounded-t-xl border-x border-t border-zinc-800` (drop bottom border + bottom radius)
- MarginTable wrapper: add `rounded-b-xl border-x border-b border-zinc-800` (no top border)
- Remove any `gap` between them in the parent layout

Adjust if visual check reveals double-border issues.

### 4. MarginFilters: absorb FilterPresetsBar

#### Move
All logic from `src/components/tires/FilterPresetsBar.jsx`:
- `readPresets()`, `writePresets()`, `newId()` helpers
- localStorage key `skedaddle-tire-margin-presets-v1` (unchanged)
- Naming modal, compact menu (Popover)
- "Save current" / "Load preset N" UX

…moves into `MarginFilters.jsx` as a private (non-exported) `FilterPresetsSection` component.

#### Wire
At the bottom of MarginFilters' outer div (after the existing chip rows):
```jsx
<div className="mt-3 border-t border-zinc-800 pt-3">
  <FilterPresetsSection
    brand={brand}
    useTagFilters={useTagFilters}
    lrFilters={lrFilters}
    minMargin={minMargin}
    needsReposting={needsReposting}
    onApplyPreset={onApplyPreset}
  />
</div>
```

`onApplyPreset` is a new prop on `MarginFilters`. `TiresDashboard` already has `applyFilterPreset` — pass it through.

#### Delete
- `src/components/tires/FilterPresetsBar.jsx` (file)
- Its import in `TiresDashboard.jsx`
- Its JSX usage in the filter panel block

Tests covering preset save/load (if any) move to `MarginFilters.test.jsx` or stay in their existing location with imports updated.

### 5. MarginTable: column header contrast + remove select-all checkbox

#### Header className upgrade
Find `<th>` elements in the table header. Update className from `text-zinc-500` → `text-zinc-300 font-semibold text-xs uppercase tracking-wide`. Verify against actual current styling per column — some columns may already have stronger treatment; do not downgrade.

Contrast result: `text-zinc-300` on `bg-zinc-900` ≈ 11.5:1 (AAA).

#### Remove header select-all checkbox
The current `<thead>` contains an `<input type="checkbox" aria-label="Select all filtered rows">`. Remove it. Body row checkboxes remain.

The Select All function moves to the toolbar (section 3).

## Edge cases (consolidated)

| Case | Behavior |
|---|---|
| Hidden Gems list empty | Render nothing |
| Hidden Gems 1–3 items | Inline rows only; no "Show more" |
| Hidden Gems >3 items | 3 inline + "Show more (N more)" |
| `onPost` undefined | "Post it" / "Post selected" no-op (do not throw) |
| All `onPost` reject | Toast: `"0 posted, N failed"` |
| Some succeed, some fail | Toast: `"X posted, Y failed"` |
| Toolbar ref null at first render | Skip measurement; overlay falls back to top: 0; next render re-measures |
| `pageRows.length === 0` | Hide Select All button (no rows to act on) |
| `sortedRows.length === pageRows.length` | "Select all M matching" link never shown |
| Window resize while overlay open | Recompute `top` |
| Long gem label | `truncate` (existing pattern) |
| Slow `onPost` network | CTA stays disabled with `Posting N…` until allSettled |
| Modal stacking (e.g., Hidden Gems modal opens row detail) | Inner modal uses `MODAL_CENTER_BACKDROP_TOP` (z-[140]) |
| Light theme | All zinc/amber/emerald/rose tokens auto-remap via `[data-theme='light']` block in `index.css` — verify amber active state visually |
| `prefers-reduced-motion` | Respected via existing `sk-modal-*-enter` keyframes (which are wrapped in `@media (prefers-reduced-motion: no-preference)` at the keyframe level — confirm) |

## Testing strategy

### Unit / component tests (vitest + @testing-library/react)

- **HiddenGemsSurface**
  - Renders 0 rows when list empty
  - Renders 3 inline rows when list >= 3
  - "Show more" only renders when list.length > 3
  - Modal opens on "Show more" click; focus moves inside; Escape closes; focus returns to trigger
  - Tab/Shift+Tab focus trap works
  - Checkbox toggles update `modalSelected` Set
  - "Post selected" disabled when 0 selected; disabled while `posting`
  - `Promise.allSettled` partial-failure case: toast shows `"X posted, Y failed"`
- **MarginFilters / FilterPresetsSection**
  - Save current → preset persists in localStorage
  - Load preset → `onApplyPreset` called with correct payload
  - Naming modal accepts/rejects empty names
  - Tests covering old `FilterPresetsBar` migrate or delete
- **TiresDashboard two-stage Select All**
  - Default state: button reads "Select page (N)"
  - After click: button reads "N selected"; secondary link visible iff `moreBeyondVisible`
  - After secondary link: button reads "Deselect all (M)"
  - `aria-pressed` reflects state correctly
- **TiresDashboard filter overlay**
  - Open → backdrop renders at z-[120]; panel renders at correct top
  - Escape closes
  - Close button has 44×44 dimensions
  - Backdrop click closes
  - `useLayoutEffect` measurement runs on resize

### Integration verification (manual)

1. `npm run lint` — clean (no orphan imports from deleted FilterPresetsBar)
2. `npm run test` — vitest suite passes; new tests cover focus trap and two-stage transitions
3. `npm run build` — production build green; no Tailwind purge regressions
4. Manual eye-check (chronological)
   - Dashboard: Hidden Gems renders 3 rows; "Show more" appears when applicable; modal flow works end-to-end
   - Tires catalog: TopOpportunities widget gone; sticky toolbar has new Select All toggle; clicking Filters opens overlay with no layout shift; overlay close button works; preset save/load lives at bottom of filter panel; column headers are clearly readable; sticky bar and table read as one card
5. Z-index regression: open filter overlay → trigger preset Popover inside → open any other modal — verify stacking
6. Light theme check: toggle `[data-theme='light']`, verify amber active state of Select All renders correctly
7. Touch device check: tap-test on phone or emulator; close button comfortable, backdrop dismiss intentional

## Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Z-index collision between filter overlay and in-panel preset Popover | Medium | Manual stack-test step 5; bump panel z-index if needed |
| Pagination assumption wrong (no `pageRows` distinction) | Low | Two-stage button still works; secondary link silently never appears. Verify during implementation. |
| Focus trap edge case (no focusable elements in modal at mount) | Low | Modal always has at least the close button; defensive `firstFocusable?.focus()` |
| Tailwind purge drops `bg-amber-950/40` if it's only in template literals | Low | All classes here appear in static JSX; verify with `npm run build` |
| Light theme amber active state looks wrong | Low | Manual check step 6; both themes auto-remap via index.css block |
| MODAL_CENTER_PANEL_WIDE inner `<ul>` `max-h-[60vh]` conflicts with outer `max-h-[90vh]` on tall viewports | Low | If duplicate scroll, remove inner `max-h` and let outer panel scroll |

## Out of scope (deferred to other patches)

- Catalog row visual refresh (patch-629 series)
- Listing advisor flow changes
- Source-mode catalog (parking lot Topic 8)
- Margin pill threshold tuning
- Bottom nav redesign

## Open questions

None at spec time. Implementation may surface clarifications (e.g., is the catalog actually paginated?) — those are answered inline during the plan/implementation phases.
