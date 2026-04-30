# Skedaddle Portal Roadmap

Unimplemented work that has come up in build sessions. Each item has enough context to pick up cold. Move to a PR + delete the entry when shipped.

**Structure:**
- **Now** — next 1–2 ships, scoped, clear ROI
- **Next** — high value, queued, will pick up after Now
- **Later** — parked, speculative, or genuinely large
- **Tech debt / follow-ups** — small fixes surfaced in recent reviews
- **Operational tasks** — manual / human-action items, not code
- **Resolved** — kept briefly for context; trim periodically

Within each tier, items are grouped by **surface** (Tires catalog, Dashboard, CRM, etc.) so when you go to touch a surface you can see related improvements that should ship together. Look for **🔗 Bundle with:** notes on each entry.

---

## Now

### 🛞 Add Uniroyal brand support to the catalog
*Highest business-impact gap from the April 2026 eFleet comparison.* The Michelin eFleet catalog explicitly lists Uniroyal as one of the three brands available to the Loveland account (`1580951 SKEDADDLE INC LOVELAND`). Portal has zero Uniroyal SKUs today; eFleet has ~120+ Uniroyal items:
- Laredo AT (34 SKUs, all-terrain LT)
- Laredo HT (32 SKUs, highway LT)
- Tiger Paw Touring A/S (~115 SKUs under TPTOURINAS — entry-level passenger volume play, $80–$99 band)
- Power Paw A/S (35 SKUs)

Uniroyal is Michelin's value-tier brand: lower-priced, higher-velocity SKUs. Brand color token already exists (`--color-brand-uniroyal: #2e7d4a` in `index.css`). The portal renders Uniroyal correctly — just needs the data import.

🔗 **Bundle with:** *Brand stats card row*, *Brand-tier hero strip on Dashboard*, *Sidewall tag pills* — all of these reference brand counts and would benefit from Uniroyal's data being in by ship time. Doing the data import in isolation then touching Brand stats / hero strip in a separate PR means re-testing brand-mix logic twice.

### 🛞 Tires catalog visual polish bundle
A single PR that touches `MarginTable.jsx` rendering once and ships four small, related upgrades:

- **Sidewall tag pills on rows** — surface `XL`, `RWL`, `ORWL`, `MS` tags from the description column as small uppercase pills next to the Description cell, similar to existing platform pills. Color-code: XL=zinc, RWL/ORWL=zinc-400 italic, MS=cyan. Detection is a regex on existing `tires.csv` desc text.
- **Brand-color row-hover accent extension** — rows already have a left-edge brand accent strip; extend so the row's hover background tint subtly picks up the brand color too (`hover:bg-brand-bfg/5`, etc.).
- **Sticky column-header solid bar** — eFleet uses `thead { position: sticky }` with a solid color bar (deep navy). Apply a subtle solid-color bar to the very-top header row only — locks visual attention as users scroll.
- **Tread/model typography hierarchy** — push the Description column into a clean two-line treatment: MSPN bold mono on top, tread family muted secondary. Already partly there via `.sk-figures`; lean into the visual hierarchy.

All four touch the same render path. Shipping individually means four reviews of the same surface; bundling cuts the overhead by 4x.

### 🛞 XL filter chip in MarginFilters
*430 SKUs carry the XL (Extra Load) tag in their descriptions and there's no way to filter by it today.* Add an `XL` chip alongside the existing LR row in `MarginFilters.jsx`. Detection: `\bXL\b` on the description column. Surfaces 430 SKUs invisible to "give me reinforced tires" customer asks.

🔗 **Bundle with:** *Sidewall tag pills* (above) — the same regex powers both. If the regex moves to `src/utils/parseSidewallTags.js`, both the chip and the pill consume one source of truth.

---

## Next

### 🛞 Brand stats card row above the catalog
Horizontal strip of brand pill cards above MarginTable showing `MICHELIN — 627 SKUs · avg $328` + filter affordance. Click sets `brand=` filter. Uses existing `--color-brand-*` tokens. Quick visual brand-mix summary without opening Filters.

🔗 **Bundle with:** *Add Uniroyal* (Now). The pills' data shape comes alive once Uniroyal lands.

### 📊 Brand-tier hero strip on Dashboard
Brand portfolio at-a-glance widget on the Dashboard: `MICHELIN — 627 SKUs · 22.6% avg margin`, etc. Surfaces missing brands as warnings (`UNIROYAL — 0 SKUs · NOT STOCKED ⚠` until Uniroyal ships).

🔗 **Bundle with:** *Brand stats card row* (above). Same brand-aggregate selector can power both. Build the selector once in `useDashboardSignals.js`, render twice.

### 🛞 Product detail page with eFleet provenance
Click a SKU → detail page showing title/size/MSPN/tread/sidewall/LR, Buy/Retail/FET/Margin, **pricing source: Michelin eFleet ([date])** with the matched MSRP, active platform listings + posting history, margin trend over 90 days, and "other sizes in this tread family" recommendations.

🔗 **Bundle with:** *Tread/model typography* (Now). The same primary/secondary description treatment lives on this page's title.

### 🛞 FET audit endpoint
*267 eFleet items have FET > $0.* Some portal screenshots show `$3.00` FET on items where Michelin-quoted FET is `$0.00` (passenger) or `$30+` (commercial) — `$3.00` may be an overhead default mistakenly typed as FET. Build an admin/audit page listing SKUs where portal FET disagrees with eFleet-quoted FET. Surfaces tax-compliance issues on heavy-truck quotes/invoices.

🔗 **Bundle with:** *Side-by-side eFleet diff view* (below) — both compare portal data against `meta/categoryMap`/eFleet metadata. Same data shape, same admin route, share the page wrapper.

### 🛞 Side-by-side eFleet diff view
Admin/audit page showing:
- 🟡 SKUs in inventory but NOT in eFleet (potential aged stock)
- 🔵 SKUs in eFleet but NOT in inventory (sales gap, e.g. all of Uniroyal pre-Now)
- 🟢 SKUs aligned with current pricing
- Price-drift detection
Bulk-deprecate or bulk-add with one click. Diff regenerates on each new eFleet HTML upload.

🔗 **Bundle with:** *FET audit endpoint* + *eFleet account-number admin view*. All three live on the same admin/eFleet-tools page.

### 🛞 Surface eFleet account number in admin / `meta/eFleetAccount`
The eFleet HTML reports include a Ship-To string (`1580951 SKEDADDLE INC LOVELAND`). Captured by the import script, stored on `meta/categoryMap`, but never shown anywhere in the UI. Add a small admin/ops view: account, last import date, total parsed, diff size on last import. Useful for sanity-checking imports against the right account when Michelin reorganizes the program.

🔗 **Bundle with:** *eFleet diff view* + *FET audit*. Single eFleet-tools admin page.

### 🛞 Listing generator (replaces sticker idea)
Bulk action that generates listing copy + structured metadata for selected tires, ready to post to platforms. Uses eFleet metadata (tread family, size, retail, MSPN) to draft listings consistently.

### 📊 Catalog export view (printable report)
"Share / Print" button that opens a printable view of the current filtered catalog formatted like the Michelin eFleet PDF — Skedaddle-branded cover page with account/date metadata, section breaks per brand, sticky table headers, A4 page geometry. The eFleet HTML's `@media print` block is a direct reference.

### 🤖 AI sales advisor drawer
Context-aware advisor that reads the full tire catalog + completed orders and surfaces suggestions inline on the Tires page (right-side drawer). Answers:
- Which slow-moving tires should I push next?
- Which customers bought 4x recently and might repeat?
- What's my best quote for this fleet size + location?

Implementation: Anthropic via existing `ANTHROPIC_API_KEY` secret. New Cloud Function `salesAdvisorChat` hydrates context (catalog summary + completed-order stats + optional selected-tire detail) and calls the model. Drawer reachable via `?` key or fixed button. Streaming if available.

### 💰 DJ "I delivered / met customer" share-bump *(brainstorm pending)*
DJ marks an order as one he personally delivered or met the customer for, system auto-bumps his share %. Configurable bump in `meta/payoutConfig`, audit trail, distinct line item in payout reports.

8 open questions logged (DJ = user vs role, fixed vs configurable bump, retroactive markings, zero-sum vs additive, mobile flow, notification, multi-event stacking, reporting). Trigger via `/superpowers:brainstorming` before spec/plan.

---

## Later

### 🛞 Catalog-first navigation (drill-down)
Land on category → brand → tread breadcrumb instead of a 1,160-row table. Power users still get the existing flat catalog via "Show all SKUs." Casual users (and customer-facing modes) don't get vertigo from a flat view on first contact. Sort by margin% throughout so highest-money tires surface fastest.

🔗 **Subsumes:** *Tread-family grouped view*, *Group-by-tread browse mode (within category tabs)*. Both are alternative implementations of the same drill-down idea — when this lands, retire those entries.

### 🛞 Tread-family grouped view (interim if drill-down delays)
Toolbar toggle: `Group: None | Brand | Tread`. Group rows are collapsible, expand to show size variants. Mirrors how the eFleet HTML organizes (brand → tread family → sizes).

If catalog-first drill-down ships first, this becomes redundant. Hold unless customers need it sooner than the bigger nav rework.

### 🛞 Customer-facing catalog mode
Read-only `/catalog` route. No margins or buy prices, just retail + size + tread + image. Branded, printable, linkable. **Retail price shown should be the ideal medium between buy price and the highest list/sell price** — surfaces the value sweet spot, not the markup ceiling. No margin filters; category-first navigation.

🔗 **Bundle with:** *Catalog-first navigation* (above) — both want category-first browsing; the customer-facing mode is largely a permission-gated render of the same shell.

### 🛞 Brand color palette refresh (deferred until web color review)
The eFleet uses deeper saturated brand colors (Michelin `#002060`, BFG `#e31837`, Uniroyal `#006633`). Ours are softer. Hover/active states read better with the more saturated colors. **Coupled to a website visual refresh — color changes must apply consistently across portal AND public site or not at all.**

### 🛞 Admin upload UI for eFleet HTML
Drag-and-drop HTML upload, dry-run preview, one-click apply. Replaces the current CLI script. Build when monthly cadence makes the dev bottleneck a real problem.

### 🛞 Override admin UI for category corrections
Inline UI to set `tire.categoryOverride` on individual tires. Currently edits go through Firestore console. Build when miscategorizations become a real complaint.

### 🛞 Multi-source categorization (BFG / Uniroyal native catalogs)
If BFG or Uniroyal ever publish their own structured catalogs, extend `meta/categoryMap` to merge multiple sources. Today only Michelin eFleet feeds the map.

### 🛞 Automatic monthly catalog import
Cloud Function scheduled task that pulls/parses a fresh eFleet from a known location (email attachment, Drive folder, etc.) and runs the import script. Eliminates the manual run cadence.

### ⌨ Command palette action upgrade
Today the palette (Cmd+K) is search-only. Add action commands alongside the existing tire/order/customer search:
- `Log sale for <selected tire>` (opens Sale Messenger pre-filled)
- `Add tire order` (opens new-order form)
- `Quote <MSPN>` (opens Quote Calculator)
- `Go to <page>` (Dashboard / Tires / CRM / People / Analytics / Ops / Admin)
- `Toggle dark mode`
- `Sign out`

Sections: search hits, navigation, actions. Actions filter by permission (`permissionFor('tires')`, etc.) and selected context (1 tire selected unlocks Log sale / Quote; 0 selected hides them).

### 🛒 eBay sell-side API integration
See `memory/reference_ebay_developer_program.md`. Skedaddle-specific notes:
- API scope: sell-side (Inventory + Listing + Order)
- OAuth: app scopes + user tokens
- Growth gates: listing limit increases require positive-feedback history before eBay lifts caps
- Approach: start by listing 10–20 high-margin Michelin 22.5" commercials to build history, then scale

Concrete next steps:
1. Register Skedaddle as eBay developer; get production app keys
2. New Cloud Function `ebayListingPublish` accepts a tire row, publishes to eBay inventory + creates a listing offer
3. Wire to existing bulk-select toolbar (`Generate listings` already exists; add eBay alongside FB/Craigslist)
4. Track eBay listing status in `priceIntel.ebay` field or a new `tireListings` subcollection

🔗 **Bundle with:** *Listing generator* (Next) — the listing copy generator becomes the input to the eBay publisher.

### 💬 Public lead-capture page
`<SinchChatMount />` exists but isn't wired into any page. Mount candidates:
- `/intake/mechanic`: existing 5-step mobile-mechanic onboarding form. High-intent visitors, small audience but real. Best with widget bottom-left so it doesn't overlap the form's Next button.
- `/i/:token`: invite landing after invite SMS. Narrow audience; chat here is mostly for "my invite link is broken" support.
- New `/contact` or `/about` page built specifically for lead capture. Zero exists today — needs design + copy.

Until a mount lands, `createSinchChatLead` Cloud Function sits ready but unused.

### 💬 Customer-facing auth deferred work
Magic-link `/vip/:token` shipped (PR #73). Still deferred:
- Email/SMS delivery pipeline (v1 is admin copy-paste only)
- Signed-identity Sinch binding via `SINCH_CHAT_CLIENT_SECRET` so conversations persist against a stable uuid across sessions
- Token revocation (leaked URLs are reusable until 72h TTL elapses)
- Rate limiting on `generateVipLink` beyond admin-role gate
- Priority routing / dedicated VIP queue on Sinch side
- `vipTier` field persisted on `crmAccounts` (v1 accepts tier on token but doesn't persist on account doc)

### 💬 Field crew intake via Sinch Chat *(parked)*
Replacing the "Quick debrief (optional)" form on completed orders with a Sinch conversation. Upside: threads, media, agent replies. Downside: overlaps with Slack which crew already uses. Parked to avoid fragmenting internal comms.

### 💬 Mechanic/installer SOS *(parked)*
Contractor-facing chat from job detail page. Low volume, not worth building until customer-facing auth exists and there's evidence of demand.

### 💬 Invite-flow chat escape hatch *(parked)*
"Your invite isn't working?" chat on `/invite/:code` / `/handshake/:code`. Small value-add; hold unless invite-completion conversion becomes a measured problem.

---

## Tech debt / follow-ups

Surfaced during recent reviews. Each is small enough to bundle into the first PR that touches the relevant file.

### 🔧 Slim `useCategoryMap` hook (extract from useDashboardSignals)
*From category-tabs final review.* `TiresDashboard` mounts `useDashboardSignals` solely to read `categoryMap`, but that hook fires multiple Firestore reads (revenueStats, recentActivity, dashboard stats callable, etc.) that duplicate work already happening on the Dashboard route. Extract a ~10-line `useCategoryMap()` reading only `meta/categoryMap`; have both `useDashboardSignals` and `TiresDashboard` consume it.

🔗 **Bundle with:** any next touch of `useDashboardSignals.js` or `TiresDashboard.jsx`.

### 🔧 Shared `TIRE_CATEGORY_KEYS` constant
*From category-tabs final review.* The `'passenger' | 'lightTruck' | 'truck'` triple appears across 5 files. Extract `src/constants/tireCategory.js` exporting `TIRE_CATEGORY_KEYS` and `CATEGORY_LABELS`. One-file change for any future category (e.g. OTR).

🔗 **Bundle with:** *Slim useCategoryMap hook* (above) — both touch the same surface.

### 🔧 Fix `Target Firestore project: (unknown)` echo in import-efleet CLI
*From first production import.* `scripts/import-efleet-categories.mjs` reads `db.app?.options?.projectId` after init, but that field is undefined when `initializeApp` is called with `projectId` passed alongside `credential`. Write lands correctly, but the operator-safety echo is silenced. Fix: read from `sa.project_id` (already in scope), and print BEFORE the confirmation prompt.

🔗 **Bundle with:** *eFleet account-number admin view* (Next) — both touch the import path; shipping together cuts script-review overhead.

### 🔧 SelectAllToggle Stage-2 aria-pressed label clarity
*From category-tabs final review.* In Stage 2 ("N selected"), `aria-pressed=true` and the visible label reads "N selected"; clicking will clear, but screen-reader users hear "5 selected, pressed, button" with no hint. Compute a richer `aria-label` like "Deselect 5 selected" while keeping the visible label terse.

🔗 **Bundle with:** any next touch of `SelectAllToggle.jsx`.

---

## Operational tasks (your action, not code)

### 📞 Sinch US A2P 10DLC registration
Campaign submitted 2026-04-15 via Sinch dashboard (registration id `01kp9nnfdzpantwsazm6a9xt70`, brand `BOTOVPS`, use case `LOW_VOLUME`). Status `Pending Review`. Outbound SMS stays blocked (T-Mobile error 300) until campaign clears TCR. Expected 1–3 business days from submission.

### 🔐 Firebase refresh token rotation
An earlier Claude session asked for the Firebase auth blob from IndexedDB to drive a preview-browser walkthrough. The refresh token lives in that session's history. Sign out + back in on the normal browser when convenient — invalidates the old refresh token.

### 🔐 Sinch Chat frontend env vars
After a mount location is picked and `<SinchChatMount />` is imported, populate in deployment env (Vercel / local `.env`):
- `VITE_SINCH_CHAT_CLIENT_ID`
- `VITE_SINCH_CHAT_PROJECT_ID`

---

## Resolved (recent ships, kept for context)

Trim periodically.

### Catalog category sub-tabs (shipped 2026-04-29)
Spec: `docs/superpowers/specs/2026-04-29-tires-category-tabs-design.md`. `[All — N] [Passenger — N] [Light Truck — N] [Truck — N]` sub-tabs above the Tires toolbar. Categorization sourced from `meta/categoryMap` (parsed from Michelin eFleet HTML by `scripts/import-efleet-categories.mjs`) with size+LR fallback heuristic + `categoryOverride` field. Within-category filter scope; selection and search persist across tabs. URL state via `?cat=`. Includes banner/freshness chip when `meta/categoryMap` is missing or stale (>30 days).

### Tires + Hidden Gems redesign (PR #193, shipped 2026-04-29)
- Filter overlay → inline panel within the catalog content column
- Single-row toolbar merging Filters · Clear · Showing N · Select page · Sort · Table options
- Two-stage Select All (page-first, then optional Select all M matching, then Deselect all)
- Hidden Gems modal: 3-row inline preview + bulk-post via `Promise.allSettled` with toast partial-failure summary; full focus trap with focus restoration
- Sort header toggle: 2-state asc↔desc (was tri-state with dead-end on default Margin column)
- Cleaner default columns: Listed off, Photos on, Overhead off, Net $ on (removed clutter)
- Quieter `est` retail suffix (smaller, gray, lowercase)
- Decimal-width 2-line description split (`16.00R20`, `11R22.5` now match the splitter regex)
- Em-dash separator in CategoryTabs labels

### VIP concierge surface (PR #73, shipped)
Admin clicks "Generate VIP link" on CRM account detail panel → picks a tier → copies signed URL → sends out-of-band. Customer lands on `/vip/:token` and sees a VIP-branded Sinch shell with account context as metadata. Deferred work tracked under *Customer-facing auth deferred work* (Later).

### Sinch Chat: surface new lead fields in Leads UI (PR #69)
Leads table gained source pill, inquiry preview column, right-side detail drawer (contact, inquiry, page URL, referrer, sinchConversationId). Sinch inbox deep-link skipped (no stable URL pattern from Sinch).

### Description-search format mismatch (PR #71)
`tireSearchHaystack.js` strips slash-attached sidewall codes (`/BSW`, `/OWL`), normalizes load-range suffixes (`225/75R16 E` → `LR-E` form), preserves speed-rating letters. Regression fixtures in `tireSearchHaystack.fixtures.js`.

### Backdate "Log sale" (PR #68)
Sale Messenger optional `Completed at` datetime field (max: now, min: 30 days back). Rides through `sendTireSaleSms` → `completeOrder` → stamps `completedMs` and `completedAt`. 30-day lookback enforced server-side. `completedAtSource: 'backdated'` written on meaningful backdates so analytics can distinguish real-time vs. backfilled completions.

### `/dispatch` placeholder vs. external Workforce app (PR #70)
`/dispatch` route + `DispatchRedirect.jsx` stub removed. `WORKFORCE_URL` stays in `src/constants/externalUrls.ts` because Growth Lab still links externally. The `/crm/dispatch` redirect (CRM Field Dispatch tab) is unrelated and unchanged.

### "DJ streak" / "DJ dispatch" copy decision (resolved)
Role-neutral rename: `djStats` / `djStreakUi` / `djAssignedStreakDays` → `fieldStats` / `fieldStreakUi` / `fieldAssignedStreakDays`. `meta/djStats` Firestore doc name kept to avoid schema migration. CRM "DJ Dispatch" tab comment rewritten to "Field dispatch tab". Any remaining user-visible "DJ" strings are intentional product copy.

### Listing advisor model drift (resolved)
Bumped advisor fallback to `claude-sonnet-4-6` for consistency with invite greeting. Future model bumps must touch all four call sites: `functions/inviteFlow.js`, `functions/listingAdvisor.js`, `functions/taskDispatcher.js`, `functions/lookupUtilitySlackCommands.js`.

### Analytics revenue chart polish (resolved)
`MARGIN TREND (WEEKLY)` chart x-axis labels now `W06–W17`. Tooltips/latest-week pill dropped redundant `Week` prefix → reads `W15 100.0%`.

### Analytics MTD / WTD revenue tiles (resolved + backfill shipped, PR #67)
Root-caused: one existing completed order (April 12) pre-dated commit `a8dbec2` (April 13) which wired `runCompletionTransaction` to update `meta/revenueStats`. UI now distinguishes "doc alive, period is zero" (`$0.00` with hint) from "doc never populated" (em-dash with "No completions recorded yet"). Backfill: `scripts/backfill-revenue-stats.mjs`. Ops runs with `GOOGLE_APPLICATION_CREDENTIALS`; folds every completed order through `bumpRevenueFields`, overwrites `meta/revenueStats`. Dry-run + confirmation flags included.
