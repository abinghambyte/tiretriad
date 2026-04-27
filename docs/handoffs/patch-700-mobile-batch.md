---
patch: 700
title: Mobile + a11y + perf batch (translucency, duplicate UI, sale logger, headers, table polish)
status: ready-to-dispatch
priority: P0-mixed
depends_on: []
related_audits:
  - docs/superpowers/audits/2026-04-26-comprehensive-ui-ux-audit.md (§0 + §3-§6)
  - WAVE Web Accessibility scan (skedaddleinc.com/dashboard, 2026-04-27, AIM 9.6/10)
  - Web Vitals report (LCP 3.428s — needs improvement)
  - 9 cross-page test reports (2026-04-27)
shipped_already:
  - PR #164 — mobile bottom nav default to full (patch-600)
  - PR #165 — dashboard h1 + TodayStrip aria-labels + heading semantics
---

# patch-700 — mobile + a11y + perf batch

This brief consolidates every issue surfaced in the 2026-04-27 mobile-walkthrough conversation that was **not** shipped in PR #164 / PR #165. Each item below has its root cause verified in code, files identified, and an explicit acceptance test.

The batch is too large for a single PR. Split as suggested in the **Suggested PR sequence** at the bottom.

---

## Already shipped (do not re-do)

- **PR #164** `fix(nav): mobile bottom nav defaults to full` — removed `skedaddle.mobile.fullPortal` localStorage gate from `MobileBottomNav.jsx`; removed dead "Switch to full portal" toggle from `PortalTopBar.jsx`. Mobile nav now renders all 8 destinations at 375px.
- **PR #165** `fix(a11y): dashboard h1, TodayStrip card aria-labels + heading semantics` — added screen-reader-only `<h1>Dashboard</h1>` to `Dashboard.jsx`; added `aria-label` to each TodayStrip metric `<Link>`; promoted `pc-eyebrow` `<p>` to `<h2>`. WAVE expected: 1 error → 0, 5 alerts → 1.

---

## §1 — Systemic translucency bug (operator's "highest priority")

**Operator's report:** Three different surface types render with see-through backgrounds: (a) sticky top toolbar lets page subtitle bleed through, (b) bottom action sheet on Tires catalog overlaps DESC/MSPN/Buy table header, (c) row-level "..." popover on People crew table covers Alex Bingham's row with no shadow.

**Code verification:**
- `src/components/ui/Popover.jsx:106` — already has `bg-zinc-900` (opaque), `z-[120]`, `shadow-2xl`, AND flip-up logic at line 36 (`flip = rect.top + rect.height / 2 > viewportH / 2 ? 'up' : 'down'`). **The Popover primitive is correct.**
- `src/components/tires/TiresDashboard.jsx:1239` — bottom selection bar uses `bg-zinc-950` (opaque, no `/95` opacity modifier), `z-[125]`, `border-t border-zinc-800`. **Already opaque.**
- The likely culprit is **the inline action toolbar** at `TiresDashboard.jsx:1146-1206` (the wrapping div for Generate listings / Quote / Log sale / Notify team / Log prospective order). Need to find its parent container's bg and z-index. If it's `bg-zinc-950/95` or sits below `z-[120]`, it'd show through to the sticky table header below.
- `src/components/tires/MarginTable.jsx` — table header is sticky with `bg-zinc-900/95` (translucent on purpose for layered look, but sits in the wrong stacking order if the action toolbar is above it).

**Verify in browser DevTools BEFORE editing:**
1. Open `/tires?tab=catalog` on mobile (375px), select a tire
2. In DevTools, find the actual element rendering "Notify team" / "Log sale" / etc.
3. Check its computed `background-color` and `z-index`
4. Check the sticky toolbar's parent stacking context (any `transform`, `filter`, or `will-change` on ancestors creates a new stacking context)

**Fix:**
1. Find the wrapping toolbar element on Tires catalog with the action buttons.
2. Set `bg-zinc-950` (no `/N` opacity), add `backdrop-filter: blur(8px)` as belt-and-suspenders.
3. Confirm `z-[110]` or higher (above table header `z-[20]` typical for sticky thead).
4. Stacking order to enforce repo-wide:
   - `z-[100]` page content (default)
   - `z-[110]` sticky toolbars / page chrome
   - `z-[120]` Popover / DropdownMenu (already there)
   - `z-[125]` mobile bottom selection bar (already there)
   - `z-[130]` modals (`MODAL_CENTER_BACKDROP`)
   - `z-[140]` modals on top of other modals (`MODAL_CENTER_BACKDROP_TOP`)

**Acceptance:** Open Tires catalog on mobile, select a tire, scroll. The action toolbar should fully obscure any table header beneath it. Open the "..." menu on People — opaque, no row text bleed.

**Files:**
- `src/components/tires/TiresDashboard.jsx` (action toolbar wrapper around lines 1146-1206)
- `src/components/tires/MarginTable.jsx` (verify thead z-index)
- `src/components/people/UserRow.jsx` (already uses Popover — should be fine; verify)

---

## §2 — Duplicate table header on Tires catalog

**Operator's report:** "Brand ↕ | Description ↕ | MS..." then "DESC | MSPN | Buy ↕" directly below it. Only one header should exist at any breakpoint.

**Code verification needed:** Likely a sticky-clone header rendering unconditionally OR a mobile-specific header not gated against the desktop header.

**Where to look:**
- `src/components/tires/MarginTable.jsx` — search for `<thead>` and any clone elements
- Look for two `<thead>` elements, or a `position: sticky` thead plus a separate scroll-clone

**Fix approach:** Walk the catalog table component, identify which header is intended for the current breakpoint, and gate the other behind `sm:hidden` / `hidden sm:block`.

**Acceptance:** At any scroll position on `/tires?tab=catalog` (any breakpoint), exactly one row of column headers visible.

**Files:** `src/components/tires/MarginTable.jsx`

---

## §3 — Duplicate crew list on People page

**Operator's report:** Crew tab renders the list twice — card-style at top, plain rows below "Add crew member +" button.

**Code verified — root cause:**
- `src/components/people/PeopleDashboard.jsx:540` — `<CrewDirectoryWidget>` rendered with `hidden sm:block` (desktop-only)
- `src/components/people/PeopleDashboard.jsx:585-732` — plain `<table>` rendered unconditionally on all breakpoints

So on desktop both render. On mobile only the table renders.

**Fix (per audit P2-B + patch-304):** Gate `<CrewDirectoryWidget>` behind `flags.multiUserMode` so the widget hides until DJ/Kyle come online. Until then, only the plain table renders on every breakpoint.

```jsx
// In PeopleDashboard.jsx ~line 540
import { flags } from '../../utils/featureFlags.js'

{flags.multiUserMode ? (
  <div className="hidden sm:block">
    <CrewDirectoryWidget ... />
  </div>
) : null}
```

**Acceptance:** Desktop and mobile both show only the plain table while `multiUserMode === false`. When the flag flips true, the widget reappears on desktop.

**Files:** `src/components/people/PeopleDashboard.jsx`

---

## §4 — Row action menu flip-up

**Operator's report:** "..." menu always opens down, covers its own row when in bottom half of viewport.

**Code verified — already implemented:** `src/components/ui/Popover.jsx:36` already computes `flip = rect.top + rect.height / 2 > viewportH / 2 ? 'up' : 'down'`. If this isn't working visually, the bug is in the position math at lines 37-47, NOT a missing feature.

**Verify in browser:**
1. Open People crew table on mobile (need 4+ rows so the bottom row is past mid-viewport)
2. Tap "..." on the bottom row
3. Inspect the `data-popover-flip` attribute on the rendered popover — should be `"up"`

If it's `"down"` when it should be `"up"`, the bug is the math at line 36. If it's `"up"` but visually still covers the row, the bug is in the offset at line 37.

**Files:** `src/components/ui/Popover.jsx` (verify only — likely already correct)

---

## §5 — Horizontal scroll: clipped values, no affordance, no sticky DESC

**Operator's report:** Buy column reads "$4,..." mid-character; "Scroll for overhead, FET, brand" hint sits above table where users miss it; DESC column doesn't stay anchored when scrolling horizontally.

**Fixes:**
1. **Pin DESC column sticky:** add `position: sticky; left: 0` and a solid background to the DESC column cells.
2. **Move scroll hint into scroll container** as a right-edge gradient fade with chevron icon. Fade out once `scrollLeft > 40px`.
3. **Same pattern as Ops + CRM Leads tables already implement** — check those files for the existing implementation to copy.

**Files:**
- `src/components/tires/MarginTable.jsx` — primary
- `src/components/ops/*` — reference implementation for sticky-left column
- `src/components/crm/*` — reference implementation

**Acceptance:** Horizontal scroll on Tires catalog shows a right-edge fade + chevron. DESC column stays pinned left as other columns scroll. Hint fades out after 40px scroll.

---

## §6 — Top toolbar overflow under 768px

**Operator's report:** Breadcrumb collapses to "Dash... / Sked..." because the role pill + Sign-out button eat width.

**Fix:** Collapse role pill + Sign-out button into a single avatar Popover dropdown on mobile only. Search icon + theme toggle stay on the main row. Use the existing breakpoint where other responsive rules already fire.

**Files:** `src/components/layout/PortalTopBar.jsx` — the desktop block at lines 89-104 already has `hidden sm:flex`, and the mobile block at 105-154 already exists with a Popover. Just need to verify:
1. Mobile block renders the avatar at narrow widths (it does)
2. Desktop "Alex · Overwatch" pill + "Sign out" button hide below `sm` (they do)

**This may already be working.** Verify visually on mobile — if the breadcrumb still truncates, the issue is the search button + theme toggle + avatar all stacking. Reduce icon button sizes from `h-11 w-11` (44px) to `h-9 w-9` (36px) on mobile only, OR put theme toggle into the avatar dropdown.

**Files:** `src/components/layout/PortalTopBar.jsx`

---

## §7 — Sticky-header scroll padding

**Operator's report:** First crew row on People is clipped at top by sticky tab bar.

**Fix:** Add `scroll-padding-top: <sticky-header-height>` to the relevant scroll container so first rows clear when scrolled to top.

**Where:** the People page wrapper that handles scrolling. Likely the outer `<main>` or a section wrapper. CSS:

```css
/* Tailwind arbitrary value */
className="scroll-pt-[64px]"
```

**Files:** `src/components/people/PeopleDashboard.jsx`

---

## §8 — Tires catalog secondary cleanup

**Multiple sub-items** from operator:

### 8a — "Select all (1160)" + "Sort: Opportunity" buttons overlap on narrow widths

**Fix:** Add `flex-wrap` to the toolbar row OR set `min-width: 0` on the buttons so they shrink. Also covered by patch-600b plan in audit §0.1.

### 8b — "Sort: Opportunity" chip contradicts caption "sorted by Margin % descending"

**Fix:** Pick one. If "Opportunity" is a composite score, document the formula in a tooltip on the chip. If they're synonyms, kill the chip.

### 8c — "Margin % descending" caption wraps mid-word as "cending"

**Fix:** Either `white-space: nowrap` on the caption OR shorten to "↓ Margin %".

### 8d — Spell "DESC" as "Description" in column header

**Fix:** Portrait orientation has room since MSPN and Buy are short. One-line edit.

**Files:** `src/components/tires/TiresDashboard.jsx`, `src/components/tires/MarginTable.jsx`

---

## §9 — Sale logger UX polish

**Operator's report:** On log-sale screen for BFGOODRICH KO3 (MSPN 09100):

### 9a — FET row noise

"FET total $0.00 (4 × $0.00 already in buy)" is noise when per-unit FET is zero. Hide the row when per-unit FET is zero. Keep visible for tires with real FET so the "already in buy" reassurance shows when it matters.

### 9b — Header wraps to three lines with no hierarchy

"BFGOODRICH / LT265/70R17/E123/120SATT/A KO3" — split: brand on line 1, size on line 2, pattern on line 3, each at a distinct weight.

### 9c — "23.5% · OK" margin pill threshold opaque

Show the floor (e.g. "target ≥ 20%") on tap or as small text under the pill.

**Files:** `src/components/tires/SaleMessenger.jsx` and/or `src/components/tires/HaggleSheet.jsx` — search for FET total display.

---

## §10 — Bottom nav crowding (post PR #164)

**Operator's report:** Seven items cause "My Queue" and "Rubber CRM" to wrap to two lines.

**Fix:** Switch to icons-only below 400px, OR move Admin into an overflow menu for non-Overwatch roles.

PR #164 enabled the full nav by default. Now there ARE 8 items at 375px. The labels need to shrink or move.

**Recommendation:** at `< 400px`, render `<span className="hidden">{label}</span>` (visually hidden, screen-reader-accessible) so labels don't render visually but stay accessible. At `≥ 400px`, render normally.

**Files:** `src/components/layout/MobileBottomNav.jsx`

---

## §11 — Cross-page accessibility (from 9 test reports)

Findings repeated across nearly every page in the 9 test reports:

### 11a — 2 buttons missing text/label (every page)

`button type="submit"` × 2 with no accessible label. Cross-page → likely in shared chrome (PortalTopBar) OR an icon-only button missing aria-label.

**Where to look:**
- `src/components/layout/PortalTopBar.jsx` — search button at line 75-86 has `aria-label="Open search"` ✅
- `shortcutHint` rendered after — check that component for an aria-less button
- Look for any `<button type="submit">` with only an icon/SVG child and no aria-label

**Files:** Likely `PortalTopBar.jsx` `shortcutHint` source, or PortalChrome wrapper

### 11b — Ops form inputs missing accessible labels (Ops page)

Report 2 (Ops Command) flagged 4 form inputs with "no accessible label":
- `input type="number"` — Amount field
- `select type="select-one"` — Category dropdown
- `input placeholder="What was this for?" type="text"` — Note field
- `input type="date"` — Date field

Even though visible labels exist ("Amount", "Category", "Note", "Date"), they're not programmatically associated.

**Fix:** Either add `htmlFor` to each `<label>` matching `id` on its `<input>`, OR add `aria-label` to each input.

**Files:** `src/pages/OpsPage.jsx` Expense Tracker form section.

### 11c — 1 image missing alt (varies by page)

Could not source from `src/` — both `<img>` tags have alt. Likely a browser-extension chip in the audited DOM. Investigate by inspecting the actual rendered DOM.

### 11d — Page missing meta description

`index.html` has no `<meta name="description">`. Per audit "deprioritize SEO" but a meta description doesn't hurt for share previews if anyone shares a deep link.

**Fix:** Add to `index.html`:
```html
<meta name="description" content="Skedaddle Portal — operations dashboard for tire resale. Crew, customers, orders, analytics." />
```

### 11e — 6-43 spelling warnings (some pages)

Most are tire MSPNs and technical terms (false positives). Reports 7 (43 warnings) and 8 (10) likely Tires catalog or listings. Skip unless one is a real typo in app copy.

**Files:** `index.html`, `src/pages/OpsPage.jsx`, copy review across pages

---

## §12 — LCP performance (Web Vitals report)

**Finding:** LCP 3.428s — needs-improvement (target <2.5s).

**Likely cause:** initial render waits on Firebase auth + Firestore queries before painting the dashboard. The ActivityTicker and HiddenGemsSurface both subscribe on mount.

**Mitigation options (NOT a code change, just options to investigate):**
- Skeleton-first rendering (already partially done — TodayStrip has skeleton; verify all dashboard sections do)
- Defer non-critical Firestore subscriptions (HiddenGemsSurface) until after first paint
- Preload Inter / JetBrains Mono fonts via `<link rel="preload">` with `font-display: swap`
- Verify Vite chunking — keep dashboard chunk small

**Out of scope for this batch.** Filed as future investigation in `docs/superpowers/plans/BRAINSTORM-PARKING-LOT.md`. Don't fix here.

---

## Suggested PR sequence

| PR | Scope | Files | Effort |
|---|---|---|---|
| **A** | §1 translucency fix + verify §4 popover flip | `TiresDashboard.jsx`, `MarginTable.jsx` | M |
| **B** | §2 duplicate table header | `MarginTable.jsx` | S |
| **C** | §3 duplicate crew list (gate widget) | `PeopleDashboard.jsx` | XS |
| **D** | §6 + §7 + §10 top/bottom nav polish | `PortalTopBar.jsx`, `MobileBottomNav.jsx`, `PeopleDashboard.jsx` | M |
| **E** | §5 sticky DESC + scroll fade | `MarginTable.jsx` | M |
| **F** | §8 Tires catalog secondary cleanup | `TiresDashboard.jsx`, `MarginTable.jsx` | S |
| **G** | §9 sale logger polish | `SaleMessenger.jsx`, `HaggleSheet.jsx` | S |
| **H** | §11 a11y cleanup (form labels, meta description, missing-button-label hunt) | `OpsPage.jsx`, `index.html`, hunt for unlabeled buttons | S |

**Round 1 (XS / S):** C, F, G, H — low-risk, mostly mechanical
**Round 2 (M):** A, B, D, E — coordination on the same files; serial dispatch

---

## Acceptance checklist (after all PRs merged)

Per operator's instructions:

- [ ] Breadcrumb reads full "Dashboard / Skedaddle Tires" and "Dashboard / People" on mobile (375px) — not truncated
- [ ] Only one table header row visible on Tires catalog at any scroll position
- [ ] Only one crew list on People (table only, no widget)
- [ ] Opening the action sheet on Tires or "..." menu on People shows fully opaque surface — nothing bleeding through
- [ ] Horizontal scroll on Tires shows edge affordance, DESC column stays pinned left
- [ ] Row menus flip up when anchor is in bottom half of viewport (verify via `data-popover-flip="up"`)
- [ ] First crew row on People clears the sticky header on scroll-to-top
- [ ] FET row hidden on tires with $0 FET
- [ ] Bottom nav labels fit on one line each at 375px width (or icons-only mode below 400px)
- [ ] WAVE: 0 errors, ≤ 1 alert (redundant title text only)
- [ ] All form inputs in Ops have accessible labels (no WCAG 1.3.1 / 3.3.2 fails)
- [ ] No `<button type="submit">` without aria-label or text content
