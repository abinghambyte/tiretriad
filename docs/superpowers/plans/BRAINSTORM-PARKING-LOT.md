# Brainstorm parking lot

**Status:** Live working doc. Updated as new topics surface; cleared as topics get brainstormed and converted into specs/plans.

**How this gets used:** When the operator says "Storm Time", we walk this doc top to bottom, pick a topic, and brainstorm it together. Each brainstorm produces a spec in `docs/superpowers/specs/`, then a plan in `docs/superpowers/plans/`.

---

## Topic 1: Tire retail backfill

**Spec draft:** `docs/superpowers/specs/2026-04-25-tire-retail-backfill-design.md`

**Why it matters:** All 1,160 tires use estimated retail. Every margin/quote/HaggleSheet/Listing Advisor number is computed against estimates. Until this is real, we can't trust any pricing-aware feature.

**Decisions blocking the plan:**
1. Do we have a master spreadsheet of MSPN → retail? (If yes, Option A wins outright.)
2. What target margin does the auto-derive formula use? `1.30` × buy? `1.40`? `payoutConfig.targetMarginPct`?
3. Track `retail.source` = `'priceIntel' | 'derived' | 'manual'` so the UI can warn on derived prices?
4. Should manual edits get a `retail.locked: true` flag so future bulk-derives skip them?
5. Hybrid recommendation: C → D → E (priceIntel copy → derive `buy×1.30` → manual MarginTable edits). Confirm or pick differently.

**Pre-storm reading:** Section "Options to consider" in the spec lists 5 alternatives.

---

## Topic 2: Wipe-script safety + customer recovery

**Spec draft:** `docs/superpowers/specs/2026-04-25-wipe-safety-and-customer-recovery-design.md`

**Why it matters:** The 2026-04-25 wipe took out real customer history because the script couldn't distinguish test from prod data. Going forward, every cleanup script needs guardrails OR we lose customer data again.

**Decisions blocking the plan:**
1. **PITR status.** Operator must check Firebase Console → Firestore → Backups. If ON: restoration possible. If OFF: customer history is gone, enable for the future.
2. Adopt **soft-delete** (`archivedAt: Timestamp | null`) across all production collections, or just orders/contacts/users?
3. Retrofit existing test data with **`testFixture: true`** flag, or only enforce on new test data?
4. Should every cleanup script trigger a **Firestore export first**, or only "dangerous" ones (>100 doc deletions)?

**Related:** GCP audit (`2026-04-26-gcp-resource-cleanup.md`) flags `skedaddle-os-firestore-backup` Cloud Run service may not be functioning. Storm this topic only after the backup investigation completes — the answer changes everything.

---

## Topic 3: Cmd+K command palette

**Source:** `2026-04-26-comprehensive-ui-ux-audit.md` §1 ("Upgrade global search").

**Why it matters:** Current `[Q]` button is unrecognizable. Operators expect `Cmd+K` as a near-universal pattern. This unlocks "navigate to anywhere in 2 keystrokes" which is huge for a multi-page portal.

**Decisions blocking the plan:**
1. **Scope.** Pages only (CRM, Tires, Ops, Analytics)? Or pages + entities (specific tires by MSPN, specific leads by name)? Or pages + actions ("Log a sale", "Open Sale Messenger", "Toggle dark mode")?
2. **Library choice.** [`cmdk`](https://github.com/pacocoursey/cmdk) (vaul-style, Radix-based, ~12KB) is the React-21 ecosystem default. [`kbar`](https://github.com/timc1/kbar) is older and slightly bigger but more featureful. Or roll our own on Headless UI Combobox?
3. **Mobile fallback.** Cmd+K is desktop-only. On mobile, does the same trigger become a full-screen search overlay, or do we just ship desktop and leave mobile alone?
4. **Indexing strategy.** Static config (manually maintained list of pages/actions) vs. dynamic registry (each page registers its commands)? Static is simpler; dynamic scales better.
5. **Shortcuts inside the palette.** Should results show keyboard shortcuts next to them so users learn them? (Big UX win, low-effort.)

---

## Topic 4: CRM rebuild (Rubber CRM Kanban)

**Source:** `2026-04-26-comprehensive-ui-ux-audit.md` §6.

**Why it matters:** Current CRM is generic SaaS boilerplate. Replacing with logistics-focused 5-stage funnel + drag-drop trash/account-creation zones turns it from "another CRM" into a workflow tool that matches how Skedaddle actually sources tires.

**Decisions blocking the plan:**
1. **Stage names final?** Proposed: `Spotted → Researched → Contacted → Evaluating → Negotiating`. Lock or revise?
2. **Won terminus.** What happens after Negotiating? Is there a `Won` column at the end, or does a closed lead convert to a Customer doc and disappear from the board?
3. **Lost lifecycle.** Audit says delete the static "Lost" column (the existing toggle button is enough). Confirm.
4. **Drag zones.** Two proposed bottom-of-screen targets: "Trash" (soft-delete the card) and "Create Account" (open a customer-creation modal pre-filled from the lead). Right model? Should there be a third zone (e.g., "Park" for not-now-but-keep)?
5. **Lead intake.** Single `+ New Lead` button (audit recommends). Where does it go — top-right? In the kanban header next to filters? Floating action button?
6. **What enters "Spotted"?** Manual lead creation only? Or auto-population from Kyle's research queue (`tirepriceresearchafternoon`) or from inbound SMS leads?
7. **Card content.** What 3-5 fields render on each kanban card? (Name, source, last touch, est. value, owner?)
8. **Filters to keep.** Audit kills the geographical filter (NoCo only). Keeps owner? Stage? Date range? Tag?
9. **Move "Total leads / Conversion rate" up.** Confirm the placement target (next to nav tabs vs. above the kanban board itself).

---

## Topic 5: Dashboard onboarding consolidation

**Source:** `2026-04-26-comprehensive-ui-ux-audit.md` §2.

**Why it matters:** Currently the dashboard shows 5 separate empty-state widgets (Pending, Top Sellers, Last Sale, Total Profit, Recent Activity). At zero data this is visual fatigue and hides what the user should actually do. Replace with one "Getting Started" module that grades itself and disappears once enough data exists.

**Decisions blocking the plan:**
1. **What does the consolidated module look like at zero data?** Checklist? Big single CTA? Mini-tour?
2. **Once dismissed, can it come back?** (e.g., user adds tires then runs out — does the empty state return, or stay dismissed forever?)
3. **Grading.** Does the module render itself as "3 of 5 setup steps complete" with progress, or just "you're not done yet"?
4. **Trigger threshold.** At what point does the consolidated module disappear? First completed order? First $X revenue? Operator override toggle?
5. **What setup steps belong on the checklist?** (Probable: import tires CSV, log first sale, invite Kyle, configure payouts, post first listing.)
6. **Where does the Recent Activity feed go** when there's real data? Same widget that morphs from onboarding → activity? Separate panel?

---

## Topic 6: My Queue relocation

**Source:** `2026-04-26-comprehensive-ui-ux-audit.md` §5.

**Why it matters:** "My Queue" eats a top-nav slot for an empty state. It's a temporary task list, not a global pillar.

**Decisions blocking the plan:**
1. **Dashboard widget OR header notification bell?** Or both (widget for persistent task view, bell for unread-only)?
2. **What populates "My Queue"?** Open quotes? Pending photos? Stale leads? Define before we build the widget — otherwise we build a generic shell.
3. **Persistence.** Once I dismiss a task, gone forever, or revives if the underlying condition recurs?

---

## Topic 7: Listing platform integration (post-retail-backfill)

**Source:** `2026-04-25-tire-retail-backfill-design.md` Option B ("auto-derive from existing platform listings"). Explicitly out of scope for the retail backfill but worth its own future storm.

**Why it matters:** Once retail prices are real, the next gating constraint is *getting tires listed* on Facebook Marketplace / OfferUp / Craigslist. Listing Advisor produces copy + price; nothing posts it. Manual posting is the bottleneck.

**Decisions blocking the plan (deferred — not for the next 2-3 storms):**
1. Which platforms first? (FB Marketplace highest volume; Craigslist highest signal-to-noise.)
2. Direct API integration vs. browser automation (Playwright/Puppeteer)?
3. Credentials handling — Secret Manager? OAuth? Per-platform?
4. Scrape listings back to update `retail` field automatically (closes the loop)?

---

## How to clear an item from this list

When a topic gets stormed:

1. Brainstorm produces a complete spec in `docs/superpowers/specs/`.
2. `writing-plans` skill produces a plan in `docs/superpowers/plans/`.
3. Plan execution begins (subagent-driven or inline).
4. **Move the topic from this file** to a "Stormed (history)" section at the bottom with a link to the spec + plan.
