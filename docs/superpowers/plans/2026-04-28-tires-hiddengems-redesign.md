# Tires + Hidden Gems redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish three remaining redesign items: dynamically anchored filter overlay, two-stage Select All toggle, and the Hidden Gems 3-row preview + bulk-post modal with focus trap and partial-failure handling.

**Architecture:** All three tasks edit existing components; no new files. Follow patterns already in the codebase: `useLayoutEffect` for DOM measurement, derived booleans for toggle state, `Promise.allSettled` for partial-failure aggregation, hand-rolled focus trap inside the modal. Modal chrome (`MODAL_CENTER_BACKDROP`, `MODAL_CENTER_PANEL_WIDE`) and z-index conventions (`src/index.css` stacking comment) are reused — do not invent new tokens or layers.

**Tech Stack:** React 19, Vite, Tailwind v4, Vitest + @testing-library/react, Firebase (no backend changes here).

**Source spec:** `docs/superpowers/specs/2026-04-27-tires-hiddengems-redesign-design.md`

**Out of scope (already shipped):** Tasks 1, 3, 5, 6 from the spec are already in `main`. Audit confirmed.

**Worktree:** `.claude/worktrees/tires-hiddengems-redesign/` on branch `tires-hiddengems-redesign`.

---

## Task 1: Filter overlay — dynamic anchoring + close button

Today the overlay uses hardcoded `top-[148px]`/`sm:top-[164px]`. Drift risk if toolbar height changes. Add ref-based measurement and an explicit 44×44 close button.

**Files:**
- Modify: `src/components/tires/TiresDashboard.jsx` (sticky toolbar wrapper around line 944; filter overlay block around lines 875–906)
- Test: `src/components/tires/TiresDashboard.test.jsx` (create if absent — check first)

### Step 1: Read current state

- [ ] **Step 1: Read TiresDashboard.jsx around the filter overlay**

Read `src/components/tires/TiresDashboard.jsx` lines 870–910 to confirm current shape of `filtersOpen` block and capture the exact existing className strings. Look for the sticky toolbar's outer div around line 944.

- [ ] **Step 2: Check whether TiresDashboard.test.jsx exists**

Run from worktree root:
```bash
ls src/components/tires/TiresDashboard.test.jsx 2>/dev/null && echo EXISTS || echo MISSING
```

If MISSING, the test file will be created in Step 3. If EXISTS, append tests to it.

### Step 2: Failing test — overlay anchors below toolbar

- [ ] **Step 3: Write failing test for dynamic positioning**

Add to (or create) `src/components/tires/TiresDashboard.test.jsx`. The test must mock `getBoundingClientRect` on the toolbar element and assert the overlay receives `top: <bottom + 4>`.

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TiresDashboard } from './TiresDashboard'

// NOTE: TiresDashboard has many props/contexts. If a wrapper or fixture exists
// (e.g. renderTiresDashboard helper), use it. Otherwise mock the minimum
// inputs (tires=[], hooks) per the existing pattern in HiddenGemsSurface.test.jsx.

describe('TiresDashboard filter overlay', () => {
  beforeEach(() => {
    // Force a deterministic toolbar.bottom for measurement
    Element.prototype.getBoundingClientRect = vi.fn(() => ({
      bottom: 200, top: 100, left: 0, right: 1000, width: 1000, height: 100,
      x: 0, y: 100, toJSON: () => ({}),
    }))
  })

  it('anchors overlay 4px below the toolbar bottom edge', async () => {
    const user = userEvent.setup()
    render(<TiresDashboard /* minimal props */ />)
    await user.click(screen.getByRole('button', { name: /filters/i }))
    const panel = await screen.findByRole('dialog', { name: /filter tires/i })
    expect(panel).toHaveStyle({ top: '204px' })
  })
})
```

If the test fixture for TiresDashboard is too complex, instead extract the overlay block into a small inner component `<TiresFilterOverlay toolbarRef={...} open={...} onClose={...}>{children}</TiresFilterOverlay>` and test that in isolation. Make this decision after reading the file.

- [ ] **Step 4: Run test to verify it fails**

```bash
npm run test -- src/components/tires/TiresDashboard.test.jsx
```

Expected: FAIL — overlay does not have a dynamic `top` style; it uses Tailwind's `top-[148px]`.

### Step 3: Implement dynamic anchoring

- [ ] **Step 5: Add ref + state + useLayoutEffect**

In `TiresDashboard.jsx`, near the existing `useState(filtersOpen)` hook:

```jsx
import { useLayoutEffect, useRef, useState } from 'react'
// ...

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

Attach `ref={toolbarRef}` to the sticky toolbar's outer div (the element currently at line 944). On the overlay panel, replace the hardcoded `top-[148px] sm:top-[164px]` with `style={{ top: overlayTop }}` and remove the Tailwind top utility classes.

Confirm the panel's existing className still includes `fixed left-4 right-4 z-[120] sm:left-6 sm:right-6` plus `max-h-[80vh] overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-950 p-3 shadow-2xl`. Add `role="dialog" aria-label="Filter tires"` if missing.

- [ ] **Step 6: Run test to verify it passes**

```bash
npm run test -- src/components/tires/TiresDashboard.test.jsx
```

Expected: PASS — overlay top equals 204 (200 + 4).

### Step 4: Add close button

- [ ] **Step 7: Failing test for close button**

Append to the same `describe` block:

```jsx
it('closes overlay when the in-panel close button is clicked', async () => {
  const user = userEvent.setup()
  render(<TiresDashboard /* minimal props */ />)
  await user.click(screen.getByRole('button', { name: /filters/i }))
  const closeBtn = await screen.findByRole('button', { name: /close filters/i })
  await user.click(closeBtn)
  expect(screen.queryByRole('dialog', { name: /filter tires/i })).not.toBeInTheDocument()
})
```

- [ ] **Step 8: Run test to verify it fails**

```bash
npm run test -- src/components/tires/TiresDashboard.test.jsx -t "in-panel close button"
```

Expected: FAIL — no element with name "close filters".

- [ ] **Step 9: Implement close button**

Inside the overlay panel, before `<MarginFilters .../>`, insert a header row:

```jsx
<div className="mb-3 flex items-center justify-between">
  <h3 className="text-sm font-semibold text-zinc-200">Filters</h3>
  <button
    type="button"
    onClick={() => setFiltersOpen(false)}
    aria-label="Close filters"
    className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100"
  >
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  </button>
</div>
```

- [ ] **Step 10: Run test to verify it passes**

```bash
npm run test -- src/components/tires/TiresDashboard.test.jsx
```

Expected: PASS — both anchoring and close-button tests green.

- [ ] **Step 11: Run lint**

```bash
npm run lint
```

Expected: clean.

- [ ] **Step 12: Commit**

```bash
git add src/components/tires/TiresDashboard.jsx src/components/tires/TiresDashboard.test.jsx
git commit -m "feat(tires): dynamic filter overlay anchoring + explicit close button"
```

---

## Task 2: Two-stage Select All toggle

Today the toolbar Select All is single-stage: "Select all (N) / Deselect all (N)". Convert to Gmail-style two-stage: page-first, then optional secondary "Select all M matching" link.

**Files:**
- Modify: `src/components/tires/TiresDashboard.jsx` (toolbar button around line 1036)
- Test: `src/components/tires/TiresDashboard.test.jsx`

**Note:** The MarginTable header select-all checkbox is already absent per audit. No table change is needed unless verification step finds otherwise.

### Step 1: Verify table header checkbox state

- [ ] **Step 1: Confirm MarginTable thead has no select-all checkbox**

```bash
npx grep -nE "Select all filtered rows|select.+all.+row" src/components/tires/MarginTable.jsx || echo "no select-all in thead"
```

If it prints `no select-all in thead` (or no matches): nothing to remove. If matches appear, the matching `<input type="checkbox">` element must be deleted as part of Step 6.

### Step 2: Failing test — default label is "Select page (N)"

- [ ] **Step 2: Write failing test**

Append to `TiresDashboard.test.jsx`:

```jsx
describe('Two-stage Select All', () => {
  it('shows "Select page (N)" by default', () => {
    render(<TiresDashboard /* minimal props with 5 visible rows */ />)
    expect(
      screen.getByRole('button', { name: /select page \(5\)/i })
    ).toBeInTheDocument()
  })
})
```

Use whatever fixture the file already established for TiresDashboard rendering.

- [ ] **Step 3: Run test to verify it fails**

```bash
npm run test -- src/components/tires/TiresDashboard.test.jsx -t "Select page"
```

Expected: FAIL — current button reads "Select all (5)".

### Step 3: Implement first stage

- [ ] **Step 4: Update button label and derive state**

In `TiresDashboard.jsx`, near `sortedRows` and `selectedIds`:

```jsx
const pageRows = sortedRows
const visibleSelected =
  pageRows.length > 0 && pageRows.every((r) => selectedIds.has(r.id))
const allMatchingSelected =
  sortedRows.length > 0 && sortedRows.every((r) => selectedIds.has(r.id))
const moreBeyondVisible = sortedRows.length > pageRows.length
```

(Today there is no pagination; `pageRows === sortedRows`. The `moreBeyondVisible` branch will simply never fire — that's intentional. Leaving the abstraction in place future-proofs against later virtualization.)

Replace the existing Select All button JSX (around line 1036) with:

```jsx
<div className="flex items-center gap-2">
  <button
    type="button"
    aria-pressed={visibleSelected}
    onClick={() => {
      if (visibleSelected) {
        clearSelection()
      } else {
        toggleAllFilteredSelection(pageRows)
      }
    }}
    className={`min-h-[44px] rounded-lg border px-3 py-2 text-sm sm:min-h-0 ${
      visibleSelected
        ? 'border-amber-600 bg-amber-950/40 text-amber-100 hover:bg-amber-950/60'
        : 'border-zinc-600 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-900/60'
    }`}
  >
    {allMatchingSelected
      ? `Deselect all (${sortedRows.length})`
      : visibleSelected
        ? `${selectedIds.size} selected`
        : `Select page (${pageRows.length})`}
  </button>
  {visibleSelected && !allMatchingSelected && moreBeyondVisible ? (
    <button
      type="button"
      onClick={() => toggleAllFilteredSelection(sortedRows)}
      className="text-xs text-amber-300 underline-offset-2 hover:underline"
    >
      Select all {sortedRows.length} matching
    </button>
  ) : null}
</div>
```

If existing handler names differ (`toggleAllFilteredSelection`, `clearSelection`), use what the file actually defines. The audit confirmed the function pair exists — verify exact names while editing.

- [ ] **Step 5: Run test to verify default label passes**

```bash
npm run test -- src/components/tires/TiresDashboard.test.jsx -t "Select page"
```

Expected: PASS.

### Step 4: Failing test — after click, label flips and aria-pressed=true

- [ ] **Step 6: Add second test**

```jsx
it('flips label and aria-pressed after first click', async () => {
  const user = userEvent.setup()
  render(<TiresDashboard /* minimal props with 5 visible rows */ />)
  const btn = screen.getByRole('button', { name: /select page \(5\)/i })
  await user.click(btn)
  expect(btn).toHaveAttribute('aria-pressed', 'true')
  expect(btn).toHaveTextContent(/5 selected/i)
})
```

- [ ] **Step 7: Run test, verify it passes**

```bash
npm run test -- src/components/tires/TiresDashboard.test.jsx -t "flips label"
```

Expected: PASS — implementation already covers this from Step 4.

### Step 5: Failing test — Deselect all label after fully selected

- [ ] **Step 8: Add third test**

```jsx
it('reads "Deselect all (N)" when all rows are selected', async () => {
  const user = userEvent.setup()
  render(<TiresDashboard /* minimal props with 5 visible rows */ />)
  await user.click(screen.getByRole('button', { name: /select page \(5\)/i }))
  // Without pagination, page === all, so first click already selects all.
  expect(
    screen.getByRole('button', { name: /deselect all \(5\)/i })
  ).toBeInTheDocument()
})
```

- [ ] **Step 9: Run test, verify it passes**

```bash
npm run test -- src/components/tires/TiresDashboard.test.jsx -t "Deselect all"
```

Expected: PASS.

### Step 6: Cleanup + commit

- [ ] **Step 10: Run full test file + lint**

```bash
npm run test -- src/components/tires/TiresDashboard.test.jsx
npm run lint
```

Expected: all green.

- [ ] **Step 11: Commit**

```bash
git add src/components/tires/TiresDashboard.jsx src/components/tires/TiresDashboard.test.jsx
git commit -m "feat(tires): two-stage Select All toggle with derived selection state"
```

---

## Task 3: Hidden Gems — 3-row preview + Promise.allSettled + focus trap

Today renders 1 row inline; modal exists but uses sequential post loop (no partial-failure summary) and no focus trap.

**Files:**
- Modify: `src/components/dashboard/HiddenGemsSurface.jsx`
- Test: `src/components/dashboard/HiddenGemsSurface.test.jsx` (already exists)

### Step 1: Failing test — 3 rows rendered

- [ ] **Step 1: Read current test file**

Read `src/components/dashboard/HiddenGemsSurface.test.jsx` to confirm fixture pattern used (gem object shape, mocked `onPost`).

- [ ] **Step 2: Add failing test for 3-row preview**

Append:

```jsx
it('renders up to 3 inline gem rows when list has 5 items', () => {
  const list = Array.from({ length: 5 }, (_, i) => ({
    id: `g${i}`,
    label: `Gem ${i}`,
    relativeTime: 'just now',
  }))
  render(<HiddenGemsSurface list={list} onPost={vi.fn()} />)
  // Three of the five labels appear inline (modal closed, so only inline scope)
  expect(screen.getAllByText(/Gem \d/).length).toBe(3)
})
```

If existing fixture differs, adapt prop shape but keep the assertion: 3 labels inline.

- [ ] **Step 3: Run test, see fail**

```bash
npm run test -- src/components/dashboard/HiddenGemsSurface.test.jsx -t "3 inline gem rows"
```

Expected: FAIL — only 1 row renders today.

### Step 2: Implement 3-row preview

- [ ] **Step 4: Change inline render to slice(0, 3)**

In `HiddenGemsSurface.jsx`, find the line that renders `list[0]` (audit reported it at line 149/162). Replace the single-row JSX with a `.map()` over `list.slice(0, 3)`:

```jsx
{list.slice(0, 3).map((gem) => (
  <GemRow key={gem.id} gem={gem} onPost={onPost} />
))}
```

If the gem-row markup is currently inline (not extracted), keep it inline inside the map — do not refactor. The rule is "minimum change to make the test pass."

Update the "Show more" button conditional to `list.length > 3` and label to `Show more (${list.length - 3} more)`.

- [ ] **Step 5: Run test, see pass**

```bash
npm run test -- src/components/dashboard/HiddenGemsSurface.test.jsx -t "3 inline gem rows"
```

Expected: PASS.

### Step 3: Failing test — partial-failure summary

- [ ] **Step 6: Add failing test for Promise.allSettled toast**

```jsx
it('reports partial failure when some posts reject', async () => {
  const user = userEvent.setup()
  const onPost = vi.fn()
    .mockResolvedValueOnce(undefined)   // g0 ok
    .mockRejectedValueOnce(new Error('boom')) // g1 fail
    .mockResolvedValueOnce(undefined)   // g2 ok
  const toast = { success: vi.fn(), error: vi.fn() }
  const list = Array.from({ length: 4 }, (_, i) => ({
    id: `g${i}`, label: `Gem ${i}`, relativeTime: 'just now',
  }))
  render(<HiddenGemsSurface list={list} onPost={onPost} toast={toast} />)
  await user.click(screen.getByRole('button', { name: /show more/i }))
  // Select g0, g1, g2
  await user.click(screen.getByRole('checkbox', { name: /select gem 0/i }))
  await user.click(screen.getByRole('checkbox', { name: /select gem 1/i }))
  await user.click(screen.getByRole('checkbox', { name: /select gem 2/i }))
  await user.click(screen.getByRole('button', { name: /post selected \(3\)/i }))

  expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/2 posted, 1 failed/i))
})
```

If `toast` is provided via context/hook rather than prop, mock that instead — read the file to learn the existing pattern.

- [ ] **Step 7: Run test, see fail**

```bash
npm run test -- src/components/dashboard/HiddenGemsSurface.test.jsx -t "partial failure"
```

Expected: FAIL — current code uses sequential `forEach` post.

### Step 4: Implement Promise.allSettled bulk post

- [ ] **Step 8: Replace post loop**

Locate the modal's "Post selected" handler (audit said line 76–79). Replace whatever currently exists there with:

```jsx
async function postSelected() {
  if (modalSelected.size === 0 || posting) return
  setPosting(true)
  const ids = Array.from(modalSelected)
  const results = await Promise.allSettled(
    ids.map((id) => Promise.resolve(onPost?.(id)))
  )
  const failed = results.filter((r) => r.status === 'rejected').length
  setPosting(false)
  setModalOpen(false)
  setModalSelected(new Set())
  if (failed > 0) {
    toast?.error?.(`${ids.length - failed} posted, ${failed} failed`)
  } else {
    toast?.success?.(`${ids.length} posted`)
  }
}
```

Also add `const [posting, setPosting] = useState(false)` if missing, and update the CTA's `disabled` to `modalSelected.size === 0 || posting` and label to `posting ? \`Posting ${modalSelected.size}…\` : \`Post selected (${modalSelected.size})\``.

- [ ] **Step 9: Run test, see pass**

```bash
npm run test -- src/components/dashboard/HiddenGemsSurface.test.jsx -t "partial failure"
```

Expected: PASS.

### Step 5: Failing test — focus trap and focus restore

- [ ] **Step 10: Add failing focus-trap test**

```jsx
it('traps Tab focus inside the modal and restores on close', async () => {
  const user = userEvent.setup()
  const list = [{ id: 'g0', label: 'Gem 0', relativeTime: 'just now' },
                { id: 'g1', label: 'Gem 1', relativeTime: 'just now' },
                { id: 'g2', label: 'Gem 2', relativeTime: 'just now' },
                { id: 'g3', label: 'Gem 3', relativeTime: 'just now' }]
  render(<HiddenGemsSurface list={list} onPost={vi.fn()} />)
  const trigger = screen.getByRole('button', { name: /show more/i })
  trigger.focus()
  await user.click(trigger)

  // Tab through to last focusable; one more Tab wraps to first.
  // Simpler: focus last focusable manually, Tab once, expect first focusable focused.
  const dialog = await screen.findByRole('dialog', { name: /hidden gems/i })
  const focusables = dialog.querySelectorAll(
    'button:not([disabled]), input:not([disabled])'
  )
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  last.focus()
  await user.tab()
  expect(document.activeElement).toBe(first)

  // Close → focus returns to trigger
  await user.keyboard('{Escape}')
  expect(document.activeElement).toBe(trigger)
})
```

- [ ] **Step 11: Run test, see fail**

```bash
npm run test -- src/components/dashboard/HiddenGemsSurface.test.jsx -t "traps Tab"
```

Expected: FAIL — no focus trap, focus is not restored.

### Step 6: Implement focus trap + restore

- [ ] **Step 12: Add focus-trap effect**

In `HiddenGemsSurface.jsx`, replace any existing modal-Escape effect with the consolidated version:

```jsx
import { useEffect, useId, useRef, useState } from 'react'
// ...

const headingId = useId()
const dialogRef = useRef(null)
const previousFocusRef = useRef(null)

useEffect(() => {
  if (!modalOpen) return
  previousFocusRef.current = document.activeElement
  const dialog = dialogRef.current
  const firstFocusable = dialog?.querySelector(
    'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )
  firstFocusable?.focus()

  function onKey(e) {
    if (e.key === 'Escape') {
      setModalOpen(false)
      return
    }
    if (e.key !== 'Tab' || !dialog) return
    const focusables = dialog.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus()
    }
  }
  document.addEventListener('keydown', onKey)
  return () => {
    document.removeEventListener('keydown', onKey)
    previousFocusRef.current?.focus?.()
  }
}, [modalOpen])
```

Attach `ref={dialogRef}` and `aria-labelledby={headingId}` to the modal's panel element. Set `id={headingId}` on the modal's heading (`<h2>Hidden Gems …</h2>`).

- [ ] **Step 13: Run test, see pass**

```bash
npm run test -- src/components/dashboard/HiddenGemsSurface.test.jsx -t "traps Tab"
```

Expected: PASS.

### Step 7: Cleanup + commit

- [ ] **Step 14: Run full HiddenGems test file + lint**

```bash
npm run test -- src/components/dashboard/HiddenGemsSurface.test.jsx
npm run lint
```

Expected: all green.

- [ ] **Step 15: Commit**

```bash
git add src/components/dashboard/HiddenGemsSurface.jsx src/components/dashboard/HiddenGemsSurface.test.jsx
git commit -m "feat(dashboard): hidden gems 3-row preview + Promise.allSettled + focus trap"
```

---

## Final verification

After all three task commits:

- [ ] **Run full test suite:**

```bash
npm run test
```

Expected: all tests pass.

- [ ] **Run full lint:**

```bash
npm run lint
```

Expected: clean.

- [ ] **Build:**

```bash
npm run build
```

Expected: production build green; no Tailwind purge regressions.

- [ ] **Manual verification:**

1. Dashboard: Hidden Gems shows 3 rows; "Show more" appears with >3 items; modal flow with focus trap; partial-failure toast triggers correctly when an `onPost` rejects
2. Tires catalog: opening Filters anchors overlay exactly below toolbar (no hardcoded offset, survives window resize); explicit close button closes overlay; two-stage Select All transitions correctly; `aria-pressed` reflects state
3. Light theme spot-check: amber active state on Select All renders correctly with `[data-theme='light']`
4. Z-index regression: open filter overlay → trigger preset Popover inside → open Hidden Gems modal — verify stacking order intact

If any step fails: stop, report, do not paper over.

---

## Self-review

**Spec coverage:** Tasks from spec mapped — 1, 3, 5, 6 already shipped (verified by audit); 2, 4, 7 covered by tasks 1, 2, 3 of this plan. ✅

**Placeholder scan:** No "TBD", "TODO", "implement later". Some "verify during implementation" notes are intentional (e.g., handler names, line numbers may have drifted) — those are guidance, not placeholders. ✅

**Type consistency:** `pageRows`, `visibleSelected`, `allMatchingSelected`, `moreBeyondVisible` consistent across Task 2. `headingId`, `dialogRef`, `previousFocusRef`, `posting`, `modalOpen`, `modalSelected` consistent across Task 3. `toolbarRef`, `overlayTop` consistent across Task 1. ✅
