# Mobile chrome + Tires haggle path — design spec

**Goal:** Make the portal usable on the admin's phone for the three real phone moments (haggling defense, listing creation, catalog browsing) and fix the chrome bugs that bite during those moments. Build for Alex (admin, the only current user); do not pre-build for DJ/Kyle workflows that don't exist yet.

**Scope:** Mobile-first. Desktop is unchanged at all breakpoints ≥ 768px.

## The three real phone moments (designed-for)

1. **Haggling defense** — "Customer just offered me $X. What's the margin?" — needs to be one-tap from a tire row to a calculator that lets you stress-test offers.
2. **Listing creation** — pull tire specs/pricing on the phone while drafting a post elsewhere. Catalog has to be readable without horizontal scroll.
3. **Catalog browsing** — multiple times a day, low-ceremony glance at inventory and prices.

## Non-goals

- DJ active-jobs view (Tier 3, after invites)
- Kyle stock-confirmer view (Tier 3)
- Per-model photo library (Tier 2, after invites)
- Sale-logger polish (separate PR)
- Brand-bolt theme (separate PR, lands after this one)
- Light-mode support (never)

---

## Architecture

### Mobile chrome strategy

The portal currently uses translucent sticky surfaces (`bg-zinc-950/95`, `bg-zinc-900/80`, `bg-zinc-900/95` etc.) plus `backdrop-blur-md`. On dense data screens this reads as a bug: page content bleeds through sticky toolbars, popovers, and table headers.

Fix: every sticky or fixed surface that overlays content gets a solid base color. `backdrop-blur-md` stays as texture. Z-index gets a documented order.

### Bottom nav reduction

7 items → 2 items under sm: (Home · Tires). Search lives as a top-row input *inside* Tires, not a nav button. Avatar dropdown in the top bar absorbs role label, sign-out, theme toggle, and an admin escape ("switch to full portal" — sets a flag that disables the mobile nav reduction for that session).

### Top bar collapse

Under sm: the role pill and Sign-out button collapse into a single 44px avatar button. Tapping opens a `<Popover />` containing role label, theme toggle, sign-out, settings link (only if the route exists; checked at build time, not runtime), "switch to full portal" link.

### `<Popover />` primitive

Lives at `src/components/ui/Popover.jsx`. Renders into `document.body` via React portal so it escapes parent stacking contexts. Positions via `getBoundingClientRect()` with manual flip-up logic (no Floating UI dep). Closes on outside-click, Escape, and route change. Solid `bg-zinc-900` background, `border border-zinc-700`, `shadow-2xl`. Full a11y (`role="menu"`, focus trap, return focus on close).

### Tires catalog — mobile card layout

Under sm: the `MarginTable` desktop layout is replaced (not augmented) with a stacked card list. Each card:

- **Top row:** description (truncated to 2 lines max), MSPN as a pill
- **Body grid:** 2 columns × 3 rows showing Buy / Sell / Margin / FET / Brand / Listed-on count
- **Action row:** "Test offer" button (full-width, opens haggle sheet) + overflow `<Popover />` for less-common actions
- **Selected state:** amber ring + checkmark

This replaces the horizontal-scrolling table on mobile only. The desktop table is unchanged.

### Haggle bottom sheet

New component: `src/components/tires/HaggleSheet.jsx`.

Tap a tire on mobile → `<HaggleSheet />` slides up from the bottom (bottom-anchored, swipe-to-dismiss, Escape closes). Contents:

- **Header:** description, MSPN, current sell price
- **"Test offer" input** — single big number field, autoFocus
- **Live margin readout** — updates as user types, color-coded:
  - `green` when margin ≥ floor
  - `amber` when 0 < margin < floor (configurable, default 20%)
  - `rose` when margin ≤ 0
- **Floor warning banner** — appears when test offer drops margin below floor: "Below 20% floor — counter at $XXX for floor margin"
- **Counter-offer suggestion** — shows the dollar amount that would put the deal exactly at the floor margin
- **"Accept this offer" CTA** — calls existing log-sale flow with the test offer pre-filled

Floor margin source: existing `meta/payoutConfig.marginFloorPct` (or fall back to 20%).

### Z-index documented order

```
0       page content
10      sticky table column heads
17      sticky table top row
20      ModuleSubheader (page-level sticky header)
50      bottom nav
100     PortalChrome top bar
120     popovers (must escape parent stacking via portal)
130     drawers (CRM panels)
140     full-screen modals
150     haggle sheet (above modals so it can open from one)
200     CommandPalette
```

Values codified in a Tailwind plugin or CSS variable block; all sticky/fixed elements reference them by name.

---

## Components touched

| File | Change |
|---|---|
| `src/components/ui/Popover.jsx` | NEW |
| `src/components/ui/Popover.test.jsx` | NEW |
| `src/components/tires/HaggleSheet.jsx` | NEW |
| `src/components/tires/HaggleSheet.test.jsx` | NEW |
| `src/components/tires/TireCardMobile.jsx` | NEW (extracted from MarginTable mobile rendering) |
| `src/components/tires/TireCardMobile.test.jsx` | NEW |
| `src/components/layout/PortalChrome.jsx` | Opaque bg; avatar dropdown via Popover (sm:hidden) |
| `src/components/layout/PortalTopBar.jsx` | Avatar dropdown collapse under sm: |
| `src/components/layout/MobileBottomNav.jsx` | 2 items under sm: (Home · Tires); admin escape hatch via avatar |
| `src/components/layout/ModuleSubheader.jsx` | Opaque bg |
| `src/components/people/UserRow.jsx` | Migrate hand-rolled popover → `<Popover />` |
| `src/components/tires/TiresDashboard.jsx` | Sticky toolbar opaque; migrate any popover; mobile renders `<TireCardMobile />` list instead of `<MarginTable />`; opens `<HaggleSheet />` on row tap |
| `src/components/tires/MarginTable.jsx` | Drop the mobile-specific header (`isMobileTable` block, ~line 1242); the new card layout supersedes it. Sticky surfaces get opaque bg. |
| `src/components/people/PeopleDashboard.jsx` | Sticky tab header opaque |
| `src/index.css` | Z-index variable block |

## Accessibility

- All popovers/sheets are `role="dialog"` (or `menu`), focus-trap, return focus on close
- `aria-expanded` on triggers
- Bottom-nav buttons keep ≥ 44×44 px touch targets
- Avatar button has descriptive `aria-label` (e.g., "Open account menu — Alex Bingham, Admin")
- Haggle sheet's "Test offer" input has visible label; floor warning is `role="alert"`

## Testing

- New unit tests for `<Popover />`, `<HaggleSheet />`, `<TireCardMobile />`
- Visual regression (added in the parallel testing-foundation PR) covers the post-PR state automatically

## Risk and rollout

- **Risk:** Replacing the catalog table with cards on mobile is the biggest behavioral change. Selection persists across views (already implemented), but bulk-action affordances differ. Mitigation: keep all action buttons accessible via the per-card overflow Popover.
- **Risk:** Existing tests reference table DOM. Mitigation: tests for desktop scenarios (>= sm:) keep using the table; new mobile tests target the card layout.
- **Rollout:** Single PR, behind no flag. Desktop is bit-for-bit unchanged.
