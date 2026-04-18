# Skedaddle Portal — Polish & Optimization Roadmap

**Living document. Update as phases complete.**

---

## North Star

Every page should feel intentional, fast, and accurate. No dead columns, no disabled buttons, no empty states that look like broken data. Every crew member picks up their phone and immediately knows what to do.

---

## Current Status

The portal is **fully functional** across all modules. This roadmap is about polish, accuracy, discoverability, and reliability — not new features. Everything here is refinement work.

---

## Phase 1 — Catalog Cleanup & Polish ← IN PROGRESS

**Goal:** Tire catalog shows accurate data, no dead UI, clean proportions.

| # | Handoff | Status |
|---|---------|--------|
| 01 | Dead code removal (eBay, Discord, Category column) | Ready to execute |
| 02 | Price intel cleanup (hide confidence dots until nightly job runs) | Ready to execute |
| 03 | Catalog visual polish (column widths, margin thresholds, mobile checkboxes, empty state) | Ready to execute |

**After Phase 1:** Catalog shows real buy prices, clean 9-column table, correct margin colors, no broken indicators.

---

## Phase 2 — Dashboard Refresh

**Goal:** Dashboard is the first thing you see. It should orient you immediately and surface what needs attention.

**Issues to address:**
- Role-based cards need audit — do mechanics, suppliers, and viewers see genuinely useful cards or generic placeholders?
- Credit tracker card — verify it's wired to real data and displaying accurately
- Dashboard should surface at least one live signal: pending orders count, dead stock count, or last sale. Right now it's primarily navigation.
- Module cards are navigation tiles — fine, but add a small live data point to each (e.g., Tires card shows "1160 in catalog · 3 dead stock", Orders card shows "2 pending")

**Handoff 04:** Dashboard live signals + role-based card audit

---

## Phase 3 — CRM Polish

**Goal:** CRM kanban and leads table feel production-grade and match the actual sales workflow.

**Issues to address:**
- Kanban stage names — are the 5 stages named correctly for how Alex actually works prospects?
- Account scoring formula — verify the pain score + fleet size weighting makes sense
- Mobile kanban — drag-drop doesn't work on mobile; need a tap-to-move-stage pattern for phone use
- Deal value estimation — verify the avg tire price used in the calculation is accurate
- Lead → Account conversion flow — verify all fields carry over cleanly
- Activity log entries — is the format and timestamp display clear?
- CRM Dispatch page — is it being used? Does the mechanic job flow work end-to-end?

**Handoff 05:** CRM mobile tap-to-move, stage name audit, scoring review

---

## Phase 4 — Analytics Accuracy

**Goal:** Every number on the analytics pages is correct and meaningful.

**Issues to address:**
- Wall tab — verify real-time order feed is accurate and up to date
- Revenue tab — all-time/MTD/WTD numbers need to be verified against actual order data
- Margin % week series (12-week chart) — verify calculation matches what's in the catalog
- DJ streak logic — verify the streak is calculating correctly (consecutive days with completed orders)
- Poke conversion metric — is "poke" terminology clear to all crew members?
- Leaderboard — verify top SKU and top crew member calculations are accurate
- Fulfillment time averages — verify the time calculation is correct (intake → completion)

**Handoff 06:** Analytics data verification + label clarity pass

---

## Phase 5 — People & Crew Polish

**Goal:** Crew management panel is clean and the invite flow is bulletproof.

**Issues to address:**
- Edit panel footer — Ghost, Lock, Unlock, Delete buttons added recently; verify they all work correctly and the layout holds on narrow screens
- Invite flow — verify end-to-end after the reissueInvite fix (fresh token → NFC → registration)
- Availability blocker — verify it surfaces correctly in relevant places (does it show on the orders page or dispatch flow?)
- Permission matrix — verify all 7 modules display correctly with the right level options
- Contacts tab (customers) — phone as primary key can break; add validation or a warning if a phone number isn't E.164 format

**Handoff 07:** People panel layout QA + contacts phone validation

---

## Phase 6 — Orders Polish

**Goal:** Orders list is clear, actionable, and shows the right information at a glance.

**Issues to address:**
- Order status flow — verify the stages match the actual Slack → Kyle → DJ → complete workflow
- Payment status clarity — is it obvious which orders are paid vs unpaid?
- Customer linking — does tapping a customer name go anywhere useful?
- Mobile order list — verify it's readable and actionable on phone
- Prospective orders — are they clearly differentiated from confirmed orders?
- Order debrief notes — are they showing correctly and in the right place?

**Handoff 08:** Orders list UX audit and polish

---

## Phase 7 — Ops Page Polish

**Goal:** Ops tools are clean and accurate for Alex's admin workflow.

**Issues to address:**
- Expense tracker — category breakdown % display; verify math
- Tax prep export — date range picker timezone handling (Denver); verify exported CSV format
- Reorder queue — verify `/reorder` Slack command populates correctly and mark fulfilled/dismiss works
- Inbound SMS webhook — verify Sinch configuration instructions are accurate and the URL shown is correct

**Handoff 09:** Ops page QA pass

---

## Phase 8 — Error Handling & Reliability

**Goal:** When something fails, the user knows what happened and can recover.

**Issues to address:**
- Most try-catch blocks currently `console.error` silently — user sees nothing when a save fails
- Add error boundaries to major route components so a single component failure doesn't blank the page
- Loading states — some operations show no loading indicator; add spinners/skeletons where missing
- Firestore write failures — any save operation (permissions, overhead, CRM account, etc.) should show a toast if it fails
- Large queries (`limit(500)`, `limit(2000)`) — add a note/warning if results are capped

**Handoff 10:** Error handling pass across all modules

---

## Phase 9 — Mobile Experience

**Goal:** Every page is fully usable on a phone without frustration.

**Issues to address:**
- Catalog: always-show checkboxes (in Phase 1), column proportions on small screens
- CRM kanban: tap-to-move (in Phase 3)
- People edit panel: verify the wide modal layout collapses gracefully on mobile
- Analytics: chart readability on small screens
- Command palette (Cmd+K): does it work on mobile / touch? Is there a mobile trigger?
- Bottom nav: verify all 5 tabs are correct and permissions-gated properly

**Handoff 11:** Mobile experience audit pass

---

## Phase 10 — Growth Lab & Internal Tools

**Goal:** Alex's internal AI routing tool is accurate and useful.

**Issues to address:**
- Task dispatcher routing logic — verify the Opus/Sonnet/Haiku/Gemini routing criteria are still accurate given model updates
- Session notes persistence — localStorage is fine, but verify it doesn't conflict across multiple tabs
- The "Antigravity" routing option — verify it's still a real destination
- Copy prompt UX — verify the generated session starter prompt is high quality

**Handoff 12:** Growth Lab routing accuracy review

---

## Deferred (Not In Scope Until Ready)

These are acknowledged features that are intentionally parked:

- **eBay listing integration** — removed from UI, revisit when ready to pursue marketplace selling
- **Price intel nightly job** (`tirePriceResearch`)  — Gemini-powered buy price research. Job exists and is deployed but not actively running. When activated, `tireCatalogBuyNumber` will automatically use the researched prices. Revisit when ready to enable.
- **Discord support in SaleMessenger** — removed. Slack only.
- **Mechanic intake form** — form works but verify the submitted data actually flows through to meaningful crew records or assignment logic

---

## Handoff Index

| File | Phase | Status |
|------|-------|--------|
| `01-catalog-dead-code-removal.md` | 1 | Ready |
| `02-catalog-price-intel-cleanup.md` | 1 | Ready |
| `03-catalog-visual-polish.md` | 1 | Ready |
| `04-dashboard-refresh.md` | 2 | Not written yet |
| `05-crm-polish.md` | 3 | Not written yet |
| `06-analytics-accuracy.md` | 4 | Not written yet |
| `07-people-polish.md` | 5 | Not written yet |
| `08-orders-polish.md` | 6 | Not written yet |
| `09-ops-qa.md` | 7 | Not written yet |
| `10-error-handling.md` | 8 | Not written yet |
| `11-mobile-experience.md` | 9 | Not written yet |
| `12-growth-lab-review.md` | 10 | Not written yet |
