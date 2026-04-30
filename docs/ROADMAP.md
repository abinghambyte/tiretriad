# Skedaddle Portal — Master Roadmap
**Last updated: April 13, 2026**
**Live at: skedaddleinc.com | Repo: abinghambyte/skedaddleinc**

---

## Stack

- **Frontend:** React 19 + Vite + Tailwind CSS → Vercel (auto-deploy from GitHub main)
- **Backend:** Firebase Cloud Functions Gen2 (Node 22, us-central1) → `npm run deploy:firebase`
- **Database:** Firestore (project: skedaddle-inventory)
- **Auth:** Firebase Auth (email/password)
- **External:** Slack (Rubber Signal app), Sinch (SMS), Resend (email), Anthropic API, Gemini API (planned)

---

## Completed Phases

### Phase 1 — Close out ✅
- Removed dev test button from SaleMessenger.jsx
- Documented env var pattern

### Phase 2 — Slack interactivity ✅
- sendTireSaleSms uses chat.postMessage with Block Kit + Mark Ready button
- slackActions onRequest handles all button payloads
- Slack bot token, signing secret, channel ID now in Firebase Secret Manager (not .env)
- Mark Ready verified working end to end

### Phase 3 — Firestore orders model ✅
- orders/{id} collection with 6-stage lifecycle: pending → available → scheduled → in_transit → completed
- Note: original spec had 3 stages (pending/ready/sold) — evolved intentionally to 6 stages
- Real-time onSnapshot listener in portal, filterable orders table
- assignedTo, scheduledDate, scheduledWindow, deliveryType, paymentAmount, kylePriceOverride, priceDiscrepancy fields all live

### Phase 4 — People System ✅
- Crew tags: admin→Overwatch, supplier→Source, mechanic→Field, viewer→Spotter
- Permission matrix per module per user
- Invite flow: SMS (Sinch), NFC card, Email (Resend)
- Token system at skedaddleinc.com/i/[token]
- NFC entrance: vibration + Web Audio + Framer Motion + Anthropic generative greeting
- Handshake Protocol first-login screen
- Login tracking, suspicious login Slack alert, ghost mode, accessLog
- Timed elevation with auto-revert, access expiry scheduler

### Phase 5 — Role-based portal experience ✅
- Admin (Overwatch): full access
- Supplier (Source/Kyle): sale alerts, order status
- Mechanic (Field/DJ): assigned orders, mark fulfillment. Tanner is a silent partner with no portal access.

### Phase 6 — eBay listing integration
- Status: PLANNED
- eBay Developer Program — sandbox + production, REST API + OAuth 2.0
- Post to eBay flow from listing generator
- SellerChamp integration for passive listing automation

### Phase 7 — Portal polish ✅
- Inline CTS edit per tire row
- Bulk overhead edit (batches of 400)
- Export CSV of filtered view
- Saved filter presets (localStorage)
- Grade A/B/C badges per tire row
- react-window virtual scroll on tire table (1,160 rows)

### Phase 8 — Hygiene ✅
- Node 20 → 22 upgrade ✅
- firebase-functions v4 → v7.2.5 ✅
- GitHub Actions CI (lint + build on PRs; `functions` install check) — `.github/workflows/ci.yml` ✅

### Phase 9 — Rubber CRM ✅
- Renamed from "Fleet CRM" to "Rubber CRM" everywhere — never revert
- Kanban: Spotted → Contacted → Qualified → Quoted → Closed (VIP clients)
- Leads tab, DJ Dispatch tab

---

## Phases built April 13 2026 (beyond original roadmap)

### Credit Limit Tracker ✅
- meta/creditTracker Firestore doc
- /charge, /payment, /balance slash commands
- CreditTrackerCard embedded in Dashboard header (admin only)
- Kyle price confirmation step — kylePriceOverride written on order, amber badge in OrdersList

### Formatting Utilities ✅
- functions/format.js and src/utils/format.js
- formatCurrency, formatNumber, formatPercent, formatQty, formatCurrencyOrDash
- Applied globally across portal and Slack outputs

### Finance Foundation + Slash Commands ✅
- meta/revenueStats — running totals updated on every completion via runCompletionTransaction
- meta/crewEarnings — totalEarned/totalPaid/balance per crew member
- Pool = (paymentAmount - buyPrice - mountCost - deliveryCost - otherCost) × qty
- Split: Alex 50%, DJ 20%, Tanner 20%, Kyle 10%
- /spoils, /owed, /payout, /revenue

### Lookup + Utility Slash Commands ✅
- /stock, /margins, /pricecheck, /customer, /note, /weather, /quota, /hype, /setlimit, /setquota, /dispatch

### Schedule Slash Commands + Availability Blocker ✅
- availability subcollection under users/{uid}
- /delivery, /pickup, /reschedule, /schedule, /tomorrow, /week, /unscheduled, /openslots, /block, /unblock, /myavailability
- AvailabilityBlocker.jsx in People dashboard — green/blue/red grid

### Field Slash Commands ✅
- /onmyway, /done, /myorders, /sms, /confirm

### Inventory Slash Commands ✅
- /intake, /reorder, /lowstock, /dead, /slowmovers, /velocity, /bestsellers, /forecast
- meta/reorderQueue
- SLACK_KYLE_ID secret for tagging Kyle on reorder

### Portal Features ✅
- Revenue tab in Analytics — live from meta/revenueStats + completed orders
- Leaderboard tab in Analytics
- DJ streak tracker in Metrics tab
- Poke conversion rate in Metrics tab
- Customer memory enrichment in People → Customers tab
- Milestone toasts with Web Audio
- Beast Mode 🔥 badge (sold within 24h of intake)
- Morning Brief upgraded — scheduled deliveries, DJ blocks, credit balance, dead stock, VIP note
- kyleScorecard — runs 1st of each month at 8am MT

### Ops Command ✅
- /ops route live, admin only
- Expense tracker (expenses collection)
- Tax prep CSV export (exportTaxPrepCsv callable)
- Reorder queue UI (reads meta/reorderQueue)
- Inbound SMS parsing (inboundSms HTTP function)
- Repeat customer VIP flag (isVip: true at 3+ orders, ⭐ in Customers tab)

---

## Secret Management

All Slack secrets live in Firebase Secret Manager:
- SLACK_BOT_TOKEN
- SLACK_SIGNING_SECRET
- SLACK_CHANNEL_ID
- SLACK_KYLE_ID

Set or update with: `firebase functions:secrets:set SECRET_NAME`
All functions import from functions/slackSecrets.js and use .value() — never process.env for Slack.
For local emulator: use .secret.local

---

## Next Priorities

1. **eBay / SellerChamp** — passive listings engine; OAuth, drafts, optional SellerChamp sync — see [EBAY-SELLERCHAMP-HANDOFF.md](./EBAY-SELLERCHAMP-HANDOFF.md)
2. **Custom Skedaddle MCP server** — read-only Firestore access for Cursor/Claude — see [SKEDADDLE-MCP.md](./SKEDADDLE-MCP.md)
3. **AI listing advisor (incremental)** — eBay sold-listing signals, per-SKU sell probability (copy generation already shipped in Listing Generator)

**Done (was pending):** GitHub Actions CI — `.github/workflows/ci.yml` on `main` and PRs to `main`.

---

## Catalog UI/UX initiative (Apr 28, 2026)

Derived from comparing the live portal catalog against the Michelin eFleet HTML report (~1,285 SKUs). Pricing is 100% aligned on the 817 overlapping SKUs. Items below are visual/interaction enhancements; data-import items (Uniroyal coverage, FET audit, eFleet diff job) are tracked separately under the Catalog Data initiative.

### High priority

- **Three-category browse mode (Light Truck / Passenger / Truck).** Add category filter chips above MarginTable; derive category from size + LR heuristics. Mirrors how customers shop and how Michelin organizes the eFleet.
- **Brand-tier hero strip on dashboard.** Above existing KPI row: pill cards per brand with SKU count + avg margin. Calls out missing brands (e.g., "Uniroyal — NOT STOCKED ⚠"). Action chip per card.
- **Product detail page with eFleet provenance.** Click a SKU → drill-down: title, size, MSPN, tread family, sidewall, LR, full pricing breakdown, "Pricing source: Michelin eFleet (date)" with matched MSRP, active platform listings, posting history, margin trend, "other sizes in this tread family" suggestions.
- **Tread/model typography refinements.** Two-line treatment in the description column: bold MSPN/size on top line, muted tread family on second line. Already partly there; lean into the visual hierarchy.
- **Sticky column header treatment.** Bolder solid background on the very top header row to anchor visual attention as users scroll long catalogs. Take cue from eFleet's `background:#002060` navy.
- **Sidewall tag pills on rows.** Surface XL, RWL, ORWL, MS as color-coded pills next to descriptions. 430 XL SKUs and 81 RWL/ORWL SKUs become discoverable; today they're buried in description text.

### Medium priority

- **Tread-family grouped view.** Toolbar toggle: `Group: None | Brand | Tread`. Group rows are collapsible; Defender LTX M/S 2 (48 SKUs) collapses into a single row that expands to show size variants.
- **Catalog-first navigation.** Land on `/tires` with a category → brand → tread breadcrumb experience (high-margin items still front and center). Power users keep flat catalog via "Show all SKUs" button. Priority axis: best margins / money first.
- **Brand stats card row above catalog.** Horizontal pill cards showing per-brand SKU count + avg price + margin floor. Click sets brand filter. Provides instant brand-mix summary without opening Filters.
- **Catalog freshness badge in header.** "Inventory current as of Apr 19, 2026 · imported from Michelin eFleet". Amber if >30 days old.
- **Brand-color hover tint.** Existing left-edge brand accent extended to hover background tint (e.g., `hover:bg-brand-bfg/5`). Reinforces brand identity subtly.
- **eFleet color-palette alignment.** Coordinate the portal's `--color-brand-*` tokens with the eFleet's deeper navy (`#002060`), red (`#e31837`), and green (`#006633`). **Coordinate with skedaddleinc.com web marketing site** — any change must propagate so brand identity stays consistent across surfaces.
- **Catalog export view (print-friendly).** "Share / Print" action that opens a printable view formatted like Michelin's report — branded cover page, Skedaddle account/date metadata, brand section breaks, sticky table headers. For sales reps and customer handouts.
- **Internal info / status footer bar.** Small footer or status bar surfacing: data sync status ("Inventory synced 9 min ago · 0 errors"), audit-trail link, margin policy reminder, keyboard shortcut hints (rotating tip), catalog version line. NOT the eFleet's customer-facing legal disclaimer — repurposed as a power-user orientation surface.
- **Listing generator enhancement** (replaces Michelin's retail-sticker idea). Bulk action on selected tires that produces optimized platform listings (Marketplace/OfferUp/Craigslist/eBay) using eFleet metadata: tread family, size, retail, MSPN. Wires into existing Listing Generator. The bulk-print sticker concept is dropped.

### Lower priority

- **Side-by-side eFleet diff view (admin / audit page).** Tabs showing: 343 portal-only SKUs (potential aged stock), 468 eFleet-only SKUs (sales gaps), 817 aligned, 0 price drift. Each section filterable + bulk-actionable. Diff regenerates on new eFleet HTML upload.
- **Customer-facing read-only catalog mode** (`/catalog`). Same data, no margins or buy prices, retail + size + tread + image only. **Retail price = ideal midpoint between buy price and current platform list price** (tunable margin-target slider). Becomes a brandable, printable, linkable artifact. Different filter set, category-first navigation.

### Rejected (after review)

- ~~Per-row "Source: Michelin eFleet" provenance pill.~~ Felt like noise — provenance lives on the detail page instead.
- ~~Customer-facing pricing disclaimer bar.~~ Internal tool; replaced with the status/orientation bar above.
- ~~Retail sticker generator.~~ Replaced by listing generator enhancement (more ROI).

---

## Revenue Strategy

**Fastest path to cash:**
- Use Listing Generator → post to Facebook Marketplace, OfferUp, Craigslist, Nextdoor
- Priority SKUs: BFG KO3 265/70R17, 265/70R18, KM3 33s/35s, Michelin Agilis van sizes

**Medium term:**
- Google Business Profile (when ready to be searchable)
- eBay account + first 20 listings for highest-demand LT sizes

**Passive income engine:**
- eBay via SellerChamp — listings run autonomously
- AI listing advisor reduces posting effort per SKU

**Highest value, slowest close:**
- Fleet contracts via Rubber CRM
- Target: I-25 HVAC fleets, Amazon DSPs, FedEx contractors, owner-operators
