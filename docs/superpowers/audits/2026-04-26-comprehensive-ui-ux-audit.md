# Comprehensive UI/UX + Functional Audit — 2026-04-26

**Status:** Captured verbatim from operator review. Triage at bottom of this file. Implementation plans live in `docs/superpowers/plans/` once brainstormed.

**Scope:** Operator UX teardown across the full portal. Distinct from `2026-04-25-production-observations.md` (which captured data-quality + crew-account issues from the same walkthrough). The two audits coexist — this one is design/UX, that one is data/ops.

---

## 0. Homepage architecture (the actual blocker)

This section was missing from the first pass and is the most consequential set of findings. The homepage is the single most-touched view in the portal and currently fails the spec.

### 0.1 Verified: 6-card module grid is missing entirely

**Spec:** `docs/AI-CONTEXT.md` lines 71-78 define the canonical homepage as a grid of six module cards in this order:

1. Skedaddle Tires → `/tires`
2. Rubber CRM → `/crm`
3. People Systems → `/people`
4. Analytics → `/analytics`
5. Growth Lab → `/growth` (Overwatch-only)
6. Ops Command → `/ops` (Overwatch-only)

Plus Credit Tracker as an admin-only header strip.

**Reality:** The Dashboard component (`src/components/dashboard/Dashboard.jsx`) renders metric cards, hidden gems, and activity widgets but **no module-card grid exists**. The six core destinations have no entry point on the homepage. The home is six empty-state placeholders stacked vertically — the worst possible use of screen real estate when there are no sales yet AND the spec calls for module cards in their place.

**Effort:** L. New `<HomepageModuleGrid />` component. Each card is a tap target with icon, title, one-line description, and (optionally) a single live metric. The spec already names the modules and routes, so naming/IA is settled. Permission gating is already encoded in `peoplePermissions.js`.

### 0.2 Verified: Mobile bottom nav is broken by default

**Files:** `src/components/layout/MobileBottomNav.jsx:7-13` (the default flag) + `src/components/layout/PortalTopBar.jsx:131-144` (the toggle).

**Behavior:** `MobileBottomNav` reads `localStorage.skedaddle.mobile.fullPortal`. If absent or not `'1'`, it shows **only Home + Tires**. The user has to find a "Switch to full portal" button in the profile dropdown to flip the flag and see CRM, People, Analytics, Ops in the nav.

**Why it matters:** From a phone, the admin literally cannot tap-to-reach CRM, People, Analytics, or Ops Command without first discovering an opt-in toggle. This isn't polish — it's a navigation defect. The default should be the full nav for an admin; the reduced nav was probably intended as a single-spotter mode and has the wrong default.

**Effort:** S. Either:
- (a) Default `fullMode` to `true` for admins (read user role, ignore the flag for Overwatch+)
- (b) Remove the flag entirely (always show full nav, gated by permission per item — which the code already does)

(b) is simpler and more correct. The reduced nav exists as a fallback when the user has zero permissions, which is already handled by the `.filter(Boolean)` chain.

### 0.3 Empty-state cards are doing double duty wrong

- "Pending Orders 0" in 48pt font is a giant number announcing the *absence* of work
- Top Sellers, Last Sale, Recent Activity are all "no sales yet" with the brand lightning bolt as the placeholder graphic
- The lightning bolt is wayfinding (top-left logo anchor), not a generic placeholder. Using it as fallback iconography dilutes the brand
- Either consolidate into a single "Getting Started" module (per §2) OR hide the cards entirely until they have data

### 0.4 Inconsistent emphasis on empty cards

- Last Sale has a green tint, Total Profit has a green outline, the others are flat gray
- **Both highlighted cards are empty.** Either both are aspirational and should look the same as the rest until they have data, or the highlight is meaningful and shouldn't fire on empty.
- Pick one rule: highlight = "card has data exceeding threshold X". Apply consistently.

### 0.5 Bottom nav is huge for two items

- Each pill is ~100px tall
- With 4-6 destinations the bar earns that height
- With two it just steals 100px from content
- Resolves automatically when 0.2 ships (full nav → 6+ items)

### 0.6 Header redundancy

- Top: SKEDADDLE wordmark + lightning bolt
- Bottom nav says "Home"
- The wordmark is only useful as a "you are signed in to the Skedaddle portal" assurance — once that lands, it's pure decoration on every subsequent view
- Collapse to bolt-only on inner pages, free ~60px

### 0.7 Search icon scope is unclear

- Tiny `[Q]` icon with no label, no scope hint
- What does it search from home? Tires? Everything? Pages?
- Either label it ("Search tires…", "Find anything…") or roll into the Cmd+K command palette (§1)
- Connects to **§1's command-palette decision**: scope of Cmd+K and behavior of this icon should be settled together.

### 0.8 Reframe what home is for

What home actually needs (not what it currently shows):

- **Quick-glance KPIs that change** — today's revenue, this week's orders, credit limit remaining, inventory on hand. Hide each one until it has non-zero data so the home doesn't lead with "0".
- **Tap targets to the six modules** (per AI-CONTEXT.md, per §0.1)
- **Active alerts only** — anything requiring action (new SMS, low margin, expiring access). Empty state for these = nothing rendered, not "0 alerts".

Empty placeholders for stats that are *always* zero in dev should hide until they have data, OR be tucked into Analytics where the operator goes looking on purpose.

---

## 1. Global architecture & the header

The application suffers from "Russian nesting doll" architecture and a cluttered utility header.

- **Eliminate text redundancy:** Across all pages, remove the repetitive `H1` headers and sub-descriptions when a breadcrumb and active tab already define the location (e.g., seeing "Tires" or "My Queue" three times in a single vertical glance).
- **Consolidate header utilities:** The persistent "Sign out" button and cramped utility icons (Settings, Theme, Help) must be moved into a standard Profile Dropdown menu triggered by clicking the `Alex · Overwatch` user chip.
- **Upgrade global search:** Replace the tiny `[ Q ]` button with a centralized, instantly recognizable search bar spanning the top header, utilizing a standard `Cmd+K` command menu pattern.
- **Lightning Bolt audit (brand protection):** Stop using the Skedaddle lightning bolt as a fallback utility icon in empty-state widgets. It dilutes the brand. Keep the logo strictly in the top-left navigation anchor.

## 2. Dashboard interface

The primary landing view creates visual fatigue through duplication, inconsistent component design, and heavy button weighting.

- **Deprioritize SEO:** As an authenticated portal, Googlebot cannot index this page. Shift development focus strictly to load performance and operator usability.
- **Consolidate empty states:** Replace the five separate zero-data widgets (Pending, Top Sellers, Last Sale, Total Profit, Recent Activity) with a single "Getting Started" onboarding module. Collapse the "Recent Activity" box to avoid massive trapped whitespace.
- **Standardize metric cards:** Enforce a unified design language for the top four data cards (consistent label casing, data point sizes, alignments). Fix the low-contrast subtext ("Waiting on first completed order") to meet WCAG AA contrast.
- **Rebalance button dominance:** The solid green `Post it` buttons dominate the visual hierarchy. Switch these to outline / ghost buttons to reduce visual noise. Increase the font weight of the actual tire data so it carries more attention than the action.
- **Clarify "Next to Post" data:** Add distinct active states (underlines / highlights) to the Coverage / Profit / Velocity tabs. Clarify ambiguous terminology like "Missing 3" → e.g., "3 Photos Missing".

## 3. Skedaddle Tires: catalog view

The table is artificially constricted, functionally bugged, and lacks visual data hierarchy.

- **Fix sorting logic (functional bug):** The margin column sort parses values as strings rather than numbers (places 22.7% below 22.6%). Update the comparator to parse to float.
- **Release viewport width:** Remove the `max-width` wrappers. Allow tables to span the full width of the monitor to eliminate horizontal scrolling on wide displays.
- **Fix the control toolbar:** Consolidate the search bar, empty filter chips, and stray bottom-right buttons into a single clean horizontal row. Delete the standalone "Sort: Margin %" button and the permanent "Select all (1160)" button (replace with a context-aware Select-All toggle that only appears when relevant).
- **Establish fixed column widths:** Lock predictable data columns (MSPN, Retail, Buy Price) to rigid widths. Assign a heavy percentage width to the Description column to fix awkward string parsing and line breaks.
- **Visualize data with pills:** Stop outputting raw text for margins. Wrap margin percentages in color-coded badge components (e.g., green ≥ 25%, amber 20–25%, red < 20%) for instant operational scanning.
- **Clean up noise:** If Overhead is always $3, remove it from the row level — change the column header to "Overhead (Flat $3)" or drop the column entirely. Strip the pagination text from `Showing 1-1160 of 1160 · ↓ Margin %` down to a clean `1,160 items`.

## 4. Skedaddle Tires: orders view

The empty state uses the wrong visual language and confusing CTAs.

- **Fix empty-state iconography:** The e-commerce shopping cart icon feels like B2C retail. Swap for a B2B logistics icon — clipboard, shipping box, or truck — matching the field-crew workflow.
- **Fix button context:** Change the empty-state CTA from "Open Skedaddle Tires" (the user is already there) to an actionable command like "Browse Catalog to Log Sale".
- **Hide workflow text:** Take the "Sourcer to Field crew workflow…" instructional subtext and hide it behind an `ℹ️` tooltip or a dismissible banner to save vertical space.

## 5. My Queue

This module wastes premium navigation space for an empty state.

- **Shelve the top-level page:** "My Queue" is a temporary task list, not a global business pillar. It does not belong in the main navigation bar.
- **Relocate functionality:** Migrate it into a Dashboard widget OR a notification bell in the global header that alerts the user only when an action is required.

## 6. Rubber CRM

The current CRM relies on generic SaaS boilerplate and redundant UI elements.

- **Rebuild the pipeline:** Discard the generic stages. Implement a logistics-focused Kanban funnel: `Spotted` → `Researched` → `Contacted` → `Evaluating` → `Negotiating`.
- **Implement drag-and-drop zones:** Delete the static "Lost" column (a "Lost" toggle button already exists). Implement drag-and-drop targets at the bottom of the screen to route cards into a "Trash" state or trigger an "Account Creation" modal.
- **Purge useless filters & metrics:** Delete the geographical location filter (operations are strictly Northern Colorado). Remove ambiguous metrics like "Min Score" unless explicitly defined.
- **Clean up clutter:** Move the "Total leads / Conversion rate" strip up into the empty space next to the navigation tabs. Remove the repetitive `+ Add to [Stage]` buttons from every column and centralize lead creation into a single `+ New Lead` button.

---

## Triage — mapping findings to work units

### A. Already covered by in-flight plan (`misty-wondering-spindle` — Tires + Hidden Gems redesign)

Findings in §3 that overlap with the existing plan:
- Filters as overlay (no layout shift)
- Select-All as toolbar toggle, not table-header checkbox
- Stronger column-header contrast (text-zinc-300 + font-semibold)
- TopOpportunities removal (Sort: Opportunity duplicate)
- Sticky toolbar visually connected to MarginTable
- FilterPresetsBar absorbed into MarginFilters

Findings in §2 that overlap:
- Hidden Gems collapsed to 1 row + "Show more" modal

**Action:** Extend the existing plan to also cover the new §3 items (margin sort float fix, max-width removal, fixed column widths, margin pills, overhead column cleanup, pagination text cleanup). Don't open a competing plan.

### B. New patches to draft (one brief per item, dispatchable)

🚨 = critical functional/navigation defect, not polish

| # | Brief | Section | Effort | Priority |
|---|---|---|---|---|
| **patch-600** | 🚨 **Mobile bottom nav: default to full nav (remove `fullPortal` localStorage gate)** | §0.2 | XS | **P0 — nav defect** |
| **patch-600b** | 🚨 **Build `<HomepageModuleGrid />` with 6 cards per AI-CONTEXT spec** | §0.1 | M | **P0 — spec gap** |
| patch-601 | Margin sort string→float fix (functional bug) | §3 | XS | P0 |
| patch-602 | Margin pills (color-coded badges) | §3 | S | P1 |
| patch-603 | Tires table viewport width release + fixed column widths | §3 | M | P1 |
| patch-604 | Overhead column → header label only; pagination text cleanup | §3 | XS | P2 |
| patch-605 | Orders empty-state: B2B icon + actionable CTA + tooltip-ized workflow text | §4 | S | P2 |
| patch-606 | My Queue removal from nav → dashboard widget OR header bell | §5 | M (needs decision) | P2 |
| patch-607 | Header utility consolidation: profile dropdown for Sign out / Settings / Theme / Help | §1 | M | P2 |
| patch-608 | Lightning Bolt audit: replace fallback usages, preserve logo anchor only | §1 + §0.3 | S | P1 |
| patch-609 | Eliminate redundant H1s when breadcrumb + tab already define location | §1 + §0.6 | M | P2 |
| patch-610 | Dashboard metric-card standardization + WCAG contrast on subtext | §2 | S | P1 |
| patch-611 | Dashboard buttons: solid → outline; emphasize tire data weight | §2 | S | P2 |
| patch-612 | "Next to Post" tab active states + "3 Photos Missing" terminology fix | §2 | XS | P2 |
| **patch-613** | Hide empty-state KPI cards until they have data (no more "0" hero numbers) | §0.3 + §0.8 | S | P1 |
| **patch-614** | Fix inconsistent emphasis on metric cards (highlight = has data, not aspiration) | §0.4 | XS | P2 |
| **patch-615** | Header collapse: bolt-only on inner pages (drop wordmark redundancy) | §0.6 | XS | P2 |

### C. Needs brainstorm before plan

| Topic | Why brainstorm | Decisions needed |
|---|---|---|
| Cmd+K command palette (§1) | Substantial scope; wrong shape locks us in | What does it search? (pages only? entities? actions?) Which library (cmdk, kbar, custom)? Mobile fallback? |
| CRM rebuild (§6) | Major architectural change | Are the 5 stages final? How do leads enter "Spotted" — manual only, or auto from research queue? Drag-to-trash UX vs confirm modal? Does "Account Creation" zone create a Customer doc or an Order doc? |
| Dashboard "Getting Started" onboarding consolidation (§2) | Replaces 5 widgets with 1 — needs a real design pass | What does the consolidated module look like at zero data? Once-dismissed, can it come back? Does it grade itself ("3 of 5 setup steps complete")? |

### D. Out of scope here (already on the docket elsewhere)

- Tire retail backfill (`2026-04-25-tire-retail-backfill-design.md`) — different concern (data, not UX)
- Wipe-safety + customer recovery (`2026-04-25-wipe-safety-and-customer-recovery-design.md`) — different concern
- Test crew account purge — manual ops task, not a patch

---

## Sequence proposal

**Round 0 (P0 — ship before everything else):** patch-600, patch-600b, patch-601
- patch-600 (one localStorage flag → mobile nav fixed in 5 lines)
- patch-600b (homepage module grid — biggest UX impact for least code)
- patch-601 (margin sort bug — pure functional fix)
- These three change the operator's daily experience the most. No coordination needed; can run in parallel.

**Round 1 (low-risk, mostly-mechanical):** patch-604, 612, 608, 605, 602, 613, 614, 615
- All XS/S effort, isolated files, low coordination
- Dispatches via Cursor; merges in any order

**Round 2 (overlay + visual polish):** misty-wondering-spindle plan execution + patch-603, 610, 611
- Pulls together the Tires catalog + Dashboard look-and-feel
- Some coordination across MarginTable / TiresDashboard files; serial dispatch

**Round 3 (architectural):** patch-606, 607, 609 + brainstorms for Cmd+K and CRM rebuild
- Header restructuring + nav shape change
- After this, brainstorm Cmd+K and CRM, then writing-plans

**Round 4 (CRM rebuild + Cmd+K):**
- Substantial; needs its own plan and likely sub-project decomposition

---

## Open questions for the operator

Before any patch is dispatched:

1. **Mobile nav default (§0.2):** Confirm we're removing the `fullPortal` localStorage gate entirely (everyone gets the full nav, gated by their permissions per-item). Anyone we'd want to see the reduced nav?
2. **Homepage module cards (§0.1):** Each card design — icon + title + one-line description, OR also a single live metric per card (e.g., Tires shows "1,160 catalog · 0 pending"; CRM shows "1 lead · 0% conversion")? Live metrics tighter, more useful, but more code.
3. **Empty-state hide-or-show (§0.8):** When a KPI is zero in dev, do we hide the card entirely, or show it dimmed/muted with a subtle "no data yet" hint? Hiding is cleaner; showing dimmed preserves layout consistency.
4. **My Queue (§5):** Dashboard widget OR header bell? (Affects patch-606 scope.)
5. **Margin pill thresholds (§3):** Confirm green ≥ 25%, amber 20–25%, red < 20% — or different breakpoints?
6. **Overhead column (§3):** Drop the column entirely, or keep it with the "Flat $3" header label and a single value displayed once?
7. **Lightning bolt fallback (§1 + §0.3):** When we strip the logo from empty states, what replaces it — a generic icon (Lucide `Inbox`, `Package`, etc.) or a context-specific icon per widget?
8. **CRM stage names (§6):** Confirm `Spotted → Researched → Contacted → Evaluating → Negotiating` is final.
9. **"Won" terminus for CRM (§6):** Where does a lead go after Negotiating? Is there a `Won` column, or do they convert to a Customer doc and disappear from the board?
10. **`Cmd+K` scope (§1 + §0.7):** Page navigation only, or also actions (e.g., "Log a sale", "Open Sale Messenger")? The home-page search icon (§0.7) feeds into this answer.
