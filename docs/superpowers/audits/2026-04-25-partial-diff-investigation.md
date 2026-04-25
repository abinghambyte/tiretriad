# Partial-diff investigation: PR #133

Date: 2026-04-25
Triggered by: Only 1 of 5 mobile-375-linux baselines updated after PR #132 (mobile chrome rewrite). Expected all 5 to diff.

## TL;DR

Hypothesis 1 is correct **with a twist**. Inspecting the four "unchanged"
mobile-375-linux baselines shows they still depict the **pre-PR-132 chrome**
(role pill + Sign out button, inline theme toggle, 7-item bottom nav). Only
`tires-mobile-375-linux.png` shows the new chrome (avatar Popover + 2-item
Home/Tires bottom nav).

The `visual-tests-update.yml` run on SHA `9009b4f` (post-PR-132) reported
"30 passed (4.6m)" with only one log line:

```
tires-mobile-375-linux.png is re-generated, writing actual.
```

That is, Playwright's `--update-snapshots` only rewrites a baseline when the
new screenshot differs from the existing one. For 14 of 15 mobile-Linux
snapshots, the post-PR-132 render came back **byte-identical to the
pre-PR-132 baseline**. The only route that produced a different render was
`/tires`, because PR-132 introduced an entirely new mobile-only component
(`TireCardMobile`) on that page. The chrome changes (top bar avatar, 2-item
nav, opaque sticky surfaces) **did not visibly land on the dashboard, orders,
people, or CRM screenshots**, even though those routes share the same
`PortalChrome` layout.

## Evidence

Cropped 80px-tall slice from each post-PR-133 mobile-375-linux baseline:

- `dashboard-top`, `orders-top`, `people-crew-top`, `crm-top`: search icon +
  inline moon (theme toggle) + "Test - Overwatch" pill + "Sign out" button.
  This is the **pre-PR-132** layout (PortalTopBar before the
  `hidden sm:flex` / `sm:hidden` split).
- `tires-top`: search icon + amber "T" avatar circle. This is the **new**
  layout.

Cropped 100px-tall slice at the bottom-nav band (y=600..700):

- `orders-mid`, `dashboard-mid`, `people-crew-mid`, `crm-mid`: 7 cells
  (Tires / My Queue / Rubber CRM / People / Analytics / Ops / Admin) - the
  pre-PR-132 nav.
- `tires-mid`: 2 cells (Home / Tires) - the new nav.

`git log` per file confirms the 4 stale baselines were last touched by
PR #131 (`772c333`); only `tires-mobile-375-linux.png` was updated by
PR #133 (`2745288`).

## Why only tires actually re-rendered

The four non-tires mobile pages **render the desktop chrome at viewport
375x667** in CI - i.e. `sm:` (>=640) appears to match for the topbar's
`hidden sm:flex` block AND the 7-item nav still appears below (which would
require `sm:hidden` on `MobileBottomNav` to NOT match, pointing the opposite
way). The combination is internally inconsistent for a 375-wide viewport,
which strongly suggests the rendered output is **stale module state from a
previous Tailwind compile or a render path that never picked up the new
classes**, rather than a clean post-PR-132 paint.

The most likely mechanism: the Playwright `webServer` runs `npm run dev`
(Vite). On first navigation, Vite transforms each route module on demand.
Tires forcibly pulled in new modules (`TireCardMobile`, `HaggleSheet`,
`Popover`), so its component tree was fresh-compiled and rendered the new
chrome. Dashboard / Orders / People / CRM did not import those new modules,
and the chrome host components (`PortalTopBar`, `MobileBottomNav`) appear
to have been served from a path where the breakpoint behavior is the
pre-PR-132 layout. Without an in-CI repro to confirm, the precise mechanism
is unverified; what *is* verified is that the rendered bytes match the old
baseline exactly.

## Recommended fix

This is a **critical gap in the testing safety net**: chrome regressions on
non-Tires routes will not be caught at mobile-375 even though those routes
make up the bulk of the portal. Fix in this order:

1. **Rebuild the suite against `npm run preview` (production build) instead
   of `npm run dev`**. Production bundles every module up front, eliminating
   Vite's lazy-transform path as a confound. Update `playwright.config.ts`
   `webServer.command` to `npm run build && npm run preview -- --port 4173 --host`
   and re-baseline once.
2. **Add a viewport-width assertion before each screenshot** -
   `await expect.poll(() => adminPage.evaluate(() => window.innerWidth)).toBe(375)` -
   so the suite fails loudly if mobile emulation isn't taking effect.
3. **After re-baselining, manually diff each new mobile-375 baseline against
   the current one** to confirm the avatar + 2-item nav are present on every
   route. If any route still shows pre-PR-132 chrome, treat that as a render
   bug, not a snapshot bug.
4. (Optional) Add a `data-testid="portal-topbar-avatar"` and
   `await page.waitForSelector('[data-testid=portal-topbar-avatar]', {state:'visible'})`
   inside `gotoAndSettle` for mobile-375 / mobile-tablet projects, so a
   missing avatar fails the run before screenshot.

## Severity

**Critical for the chrome-regression mandate.** Tier 1's whole purpose per
`tests/visual/setup.ts` is "a chrome-regression net (top bar, nav,
popovers, sticky stacking, breakpoints)". That net failed on 4 of 5 mobile
routes for the very change it was designed to catch. Until the
`dev`-vs-`preview` switch lands and the baselines are regenerated cleanly,
treat mobile-375 snapshots as advisory only.
