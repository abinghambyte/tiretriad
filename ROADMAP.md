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

### 🛞 Brand stats card row above the catalog
Horizontal strip of brand pill cards above MarginTable showing `MICHELIN - 627 SKUs · avg $328` + filter affordance. Click sets `brand=` filter. Uses existing `--color-brand-*` tokens. Quick visual brand-mix summary without opening Filters. Uniroyal data is now in (1,628 tire docs across MICHELIN/BFGOODRICH/UNIROYAL), so the pill counts are meaningful out of the gate.

🔗 **Bundle with:** *Brand-tier hero strip on Dashboard* (below). Same brand-aggregate selector powers both — build once in `useDashboardSignals.js`, render twice.

### 📊 Brand-tier hero strip on Dashboard
Brand portfolio at-a-glance widget on the Dashboard: `MICHELIN - 627 SKUs · 22.6% avg margin`, etc. Hooks into the same brand-aggregate selector as the catalog brand stats card row.

🔗 **Bundle with:** *Brand stats card row* (above). Same selector, two render sites.

---

## Next

### 🛞 Product detail page with eFleet provenance
Click a SKU → detail page showing title/size/MSPN/tread/sidewall/LR, Buy/Retail/FET/Margin, **pricing source: Michelin eFleet ([date])** with the matched MSRP, active platform listings + posting history, margin trend over 90 days, and "other sizes in this tread family" recommendations.

🔗 **Bundle with:** the existing 2-line description treatment in `TireDescriptionCell` — the same primary/secondary split + sidewall pills used on catalog rows lives at the top of this detail page.

### 🛞 FET audit endpoint
*267 eFleet items have FET > $0.* Some portal screenshots show `$3.00` FET on items where Michelin-quoted FET is `$0.00` (passenger) or `$30+` (commercial) — `$3.00` may be an overhead default mistakenly typed as FET. Build an admin/audit page listing SKUs where portal FET disagrees with eFleet-quoted FET. Surfaces tax-compliance issues on heavy-truck quotes/invoices.

🔗 **Bundle with:** *Side-by-side eFleet diff view* (below) — both compare portal data against `meta/categoryMap`/eFleet metadata. Same data shape, same admin route, share the page wrapper.

### 🛞 Side-by-side eFleet diff view
Admin/audit page showing:
- 🟡 SKUs in inventory but NOT in eFleet (potential aged stock)
- 🔵 SKUs in eFleet but NOT in inventory (sales gap)
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
Land on category → brand → tread breadcrumb instead of a 1,628-row table. Power users still get the existing flat catalog via "Show all SKUs." Casual users (and customer-facing modes) don't get vertigo from a flat view on first contact. Sort by margin% throughout so highest-money tires surface fastest.

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

### 🔧 Uniroyal-import spec doc cleanups
*Two doc-gaps surfaced in the final cross-branch review of the
uniroyal-import branch:*

1. **`priceIntel.activeBuyPrice` override semantic.** The spec at lines
   206-218 lists `priceIntel.activeBuyPrice` among "override fields the
   importer NEVER touches." The reviewer noted this is technically
   misleading: the importer always overwrites `tire.price`, and the
   override actually takes effect at READ time via
   `tireCatalogBuyNumber` (which prefers `priceIntel.activeBuyPrice`
   over `price` when set). The override is preserved in the sense that
   the importer leaves the `priceIntel` subobject alone — but `price`
   itself does get rewritten. Update the spec wording to clarify
   read-time vs. write-time semantics.

2. **`brand` field handling.** The spec lists `brand` among the
   "eFleet-sourced fields the importer's update phase touches" (Data
   Model section). The implementation excludes brand from
   `EFLEET_SOURCED_FIELDS` and routes brand mismatches to
   `brandConflicts[]` only. The code is right (auto-rebrand without
   operator action is dangerous). Update the spec to match the code.

Both are pure documentation fixes — no code change needed.

### 🔧 Slim `useCategoryMap` hook (extract from useDashboardSignals)
*From category-tabs final review.* `TiresDashboard` mounts `useDashboardSignals` solely to read `categoryMap`, but that hook fires multiple Firestore reads (revenueStats, recentActivity, dashboard stats callable, etc.) that duplicate work already happening on the Dashboard route. Extract a ~10-line `useCategoryMap()` reading only `meta/categoryMap`; have both `useDashboardSignals` and `TiresDashboard` consume it.

🔗 **Bundle with:** any next touch of `useDashboardSignals.js` or `TiresDashboard.jsx`.

### 🔧 Shared `TIRE_CATEGORY_KEYS` constant
*From category-tabs final review.* The `'passenger' | 'lightTruck' | 'truck'` triple appears across 5 files. Extract `src/constants/tireCategory.js` exporting `TIRE_CATEGORY_KEYS` and `CATEGORY_LABELS`. One-file change for any future category (e.g. OTR).

🔗 **Bundle with:** *Slim useCategoryMap hook* (above) — both touch the same surface.

### 🔧 Fix `Target Firestore project: (unknown)` echo in import-efleet CLI
*From first production import.* `scripts/import-efleet.mjs` reads `db.app?.options?.projectId` after init, but that field is undefined when `initializeApp` is called with `projectId` passed alongside `credential`. Write lands correctly, but the operator-safety echo is silenced. Fix: read from `sa.project_id` (already in scope), and print BEFORE the confirmation prompt.

🔗 **Bundle with:** *eFleet account-number admin view* (Next) — both touch the import path; shipping together cuts script-review overhead.

### 🔧 Replace `TireDescriptionCellForTest` export with `vi.importActual`
*From the tires-table-polish PR code review.* `MarginTable.jsx` exports
`TireDescriptionCellForTest = TireDescriptionCell` so the test file can render
the memoized component directly. The export ships in the production bundle
(zero runtime cost, but pollutes the module's public surface). Cleaner is to
use `vi.importActual('./MarginTable.jsx')` inside the test or a Vitest module
alias — keeps the production export surface focused on `MarginTable`.

🔗 **Bundle with:** any next touch of `MarginTable.test.jsx`.

### 🔧 SelectAllToggle Stage-2 aria-pressed label clarity
*From category-tabs final review.* In Stage 2 ("N selected"), `aria-pressed=true` and the visible label reads "N selected"; clicking will clear, but screen-reader users hear "5 selected, pressed, button" with no hint. Compute a richer `aria-label` like "Deselect 5 selected" while keeping the visible label terse.

🔗 **Bundle with:** any next touch of `SelectAllToggle.jsx`.

---

## Operational tasks (your action, not code)

### 📞 Sinch US A2P 10DLC registration
Campaign submitted 2026-04-15 via Sinch dashboard (registration id `01kp9nnfdzpantwsazm6a9xt70`, brand `BOTOVPS`, use case `LOW_VOLUME`). Status `Pending Review`. Outbound SMS stays blocked (T-Mobile error 300) until campaign clears TCR. Expected 1–3 business days from submission.

### 🔐 Firebase refresh token rotation
An earlier Claude session asked for the Firebase auth blob from IndexedDB to drive a preview-browser walkthrough. The refresh token lives in that session's history. Sign out + back in on the normal browser when convenient — invalidates the old refresh token.

### 💸 GitHub Actions usage at 90% of monthly quota (warning email 2026-04-30)
Visual-snapshot regen + Playwright runs on every push to main are the heaviest line item. Two cheap mitigations to consider when usage spikes again:
- Skip the visual workflow on `docs/`-only commits (path filters in `.github/workflows/visual-tests.yml`).
- Reduce the visual matrix from `mobile-375 × everything` to `mobile-375 × dashboard, tires` since most other routes have stable layouts.
Bigger lever: bump the GitHub plan if usage stays above 90% next month.

### 🔐 Sinch HMAC webhook-signature receive-side wiring (code change pending)
*From Sinch ticket #72178 (HMAC-SHA256 callback signing enabled 2026-04-30).* Secret is in Google Secret Manager as `SINCH_WEBHOOK_HMAC_SECRET` (version 2; version 1 was a placeholder write and is disabled). Inbound Sinch callbacks now carry `x-sinch-webhook-signature`; receiver Cloud Function should verify the HMAC against the raw body and reject mismatches with 401. Until wired, signed callbacks pass through unverified. Use `req.rawBody` (not the parsed JSON body) and `crypto.timingSafeEqual`. Point implementer at the Cloud Function name handling Sinch incoming webhooks (likely `createSinchChatLead` or a new `sinchCallbackReceiver`).

### 🔐 Sinch Chat frontend env vars
After a mount location is picked and `<SinchChatMount />` is imported, populate in deployment env (Vercel / local `.env`):
- `VITE_SINCH_CHAT_CLIENT_ID`
- `VITE_SINCH_CHAT_PROJECT_ID`

---

## Resolved (recent ships, kept for context)

Trim periodically.

### eFleet importer: skip ALL field updates when brand conflicts (shipped 2026-04-30)
`scripts/import-efleet.mjs` `planTirePhases` now `continue`s past the field-diff loop after pushing a `brandConflicts[]` entry, so when an MSPN appears under two brand sections in the eFleet HTML the existing tire's `description`/`price`/`fet`/`lr`/`tread` are not overwritten by the wrong-brand product. Operator still sees the conflict in the run summary and reconciles manually. Test `import-efleet.test.mjs` adds a 54802-shaped regression case (BFG row vs Michelin HTML duplicate) asserting `fieldDiffs === []` while `brandConflicts` carries the warning.

### eFleet description parser: slash-prefixed sidewall codes + spaced LT/P (shipped 2026-04-30)
`src/utils/parseTireDescription.js` now strips slash-attached sidewall codes (`/F`, `/BSW`, `/OWL`, `/RWL`, `/ORWL`, `/WSW`, `/RBL`, `/MS`) and collapses leading `LT `/`P ` (with space) into the no-space form before the metric size regex runs. MSPN 13906 (`LT 325/60R20 /F 128S AT T/A KO3 F`) and similar BFG/Michelin lines now parse cleanly — primary shows the size + load + speed, secondary shows the tread family. Test file `parseTireDescription.test.js` adds 11 cases covering both regression and the new format quirks.

### People page: legacy zombie users + createPortalUser self-heal (shipped 2026-04-30)
Two soft-archived `users/{uid}` docs (`alexbingham@skedaddleinc.com`, `bingham@skedaddle.co`) from a prior project still held live Firebase Auth records. Their `archivedAt` field hid them from the People table but Auth's email reservation kept blocking re-registration. `scripts/purge-legacy-users.mjs` ran in production to hard-delete both Firestore docs + inviteTokens + Auth accounts. `scripts/cleanup-orphan-auth-users.mjs` is the generic diagnostic for the broader pattern (kept as a template; default dry-run, `--apply` to commit).

`functions/peopleCallables.js` `createPortalUser` now self-heals on `auth/email-already-exists`: looks up the conflicting Auth user, checks Firestore state, and either retries after deleting a residual zombie / archived account or returns a clearer error naming the active conflict. Prevents recurrence.

### Tires catalog visual polish bundle (shipped 2026-04-30)
Spec: `docs/superpowers/specs/2026-04-30-tires-table-polish-design.md`. Bundle touching `MarginTable.jsx`:
- `SidewallPill` component renders XL and M/S tags as inline pills on the description cell's secondary line. XL is no longer rendered as inline text in the primary size-spec — it's emitted as a pill from the row's `derivedUseTags`. New `MS` tag added to `deriveTireTags` (distinct from `All-Season`).
- Sticky header bar: both desktop and mobile-table thead rows now stick to the top of the scroll container; z-index 14 sits below the existing sticky-left checkbox column. Theme-aware: `bg-zinc-50 / text-zinc-700` in light mode, `dark:bg-zinc-900 / dark:text-zinc-100` in dark mode (initial `bg-slate-900` was reverted after dim-text feedback against the light table card).
- Brand-tinted row hover via `color-mix(in oklab, ...)` consuming `--color-brand-*` tokens. Michelin tints navy, BFG red, Uniroyal green; unknown brands fall through to `--color-brand-default`.
- a11y: pills carry `role="img"` + `aria-label="Extra Load tire"` / `"Mud and Snow rated"` for cross-reader portability.
- Pre-existing bugs swept up in the same branch: Margin % sort uses `listingMargin` (matches the displayed metric, not `computeMargin` which silently returned 100% on overhead-less rows); `BFGOODRICH` brand cell widened 6→7rem; Retail 5→6.5rem; Net/Floor 5→6rem; `est` text suffix dropped on estimated retails (italic amber + dot already signals it).
- Hotfix: `scripts/fix-brand-conflict-tires.mjs` restored MSPN 54802 and 61309 to BFG-section truth after the 2026-04-29 eFleet importer overwrote their descriptions with the Michelin duplicates.

XL filter chip and stronger typography hierarchy from the original bundle plan were dropped from scope: XL was already in the Tags chip row via existing `useTags` filtering; PR #193 already shipped the 2-line description hierarchy.

### Uniroyal brand support / eFleet importer extension (shipped 2026-04-29)
Spec: `docs/superpowers/specs/2026-04-30-uniroyal-brand-support-design.md`. `scripts/import-efleet-categories.mjs` → `scripts/import-efleet.mjs`. 4-phase architecture: parser → planner → writer, with `set({merge:true})` inserts, off-program soft-tag (`offProgramAt`), diff-only-on-existing field updates (`--apply-updates`), and `--allow-mass-offprogram` safety override. First production run: 1,160 → 1,628 tire docs (MICHELIN + BFGOODRICH + UNIROYAL), 243 off-program tagged, 294 description updates applied, 2 vendor-side brand collisions caught (54802, 61309 — both appear under both BFG and Michelin sections of eFleet HTML; left as-is, source data error). Brand intentionally excluded from `EFLEET_SOURCED_FIELDS` — conflicts route to `brandConflicts[]` only, no auto-rebrand.

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
