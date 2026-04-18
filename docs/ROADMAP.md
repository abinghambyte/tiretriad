# Skedaddle Portal — Master Roadmap
**Last updated: April 18, 2026**
**Live at: skedaddleinc.com | Repo: abinghambyte/skedaddleinc**

---

## Stack

- **Frontend:** React 19 + Vite + Tailwind CSS → Vercel (auto-deploy from GitHub main)
- **Backend:** Firebase Cloud Functions Gen2 (Node 22, us-central1) → `npm run deploy:firebase`
- **Database:** Firestore (project: skedaddle-inventory)
- **Auth:** Firebase Auth (email/password)
- **External:** Slack (Rubber Signal app), Sinch (SMS), Resend (email), Anthropic API, **Gemini API** (listing advisor, tire research, future bots)

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
- Status: **DEFERRED** — not a current priority; see [EBAY-SELLERCHAMP-HANDOFF.md](./EBAY-SELLERCHAMP-HANDOFF.md) when revisiting
- Was: eBay Developer Program, OAuth, SellerChamp — passive listings (on hold)

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
- GitHub Actions CI (lint + build on PRs; functions deps install) — `.github/workflows/ci.yml` ✅

### Phase 9 — Rubber CRM ✅
- Renamed from "Fleet CRM" to "Rubber CRM" everywhere — never revert
- Kanban: Spotted → Contacted → Qualified → Quoted → Closed (VIP clients)
- Leads tab, DJ Dispatch tab

### Phase 10 — UI polish & crew intelligence (in progress)
- **Core vision polish** — hierarchy, density, role clarity: [UI-POLISH-VISION.md](./UI-POLISH-VISION.md)
- **Visual QA** — Gemini screenshot walkthrough: [GEMINI-UI-WALKTHROUGH.md](./GEMINI-UI-WALKTHROUGH.md)
- **AI listing advisor** — expand UX around existing `listingAdvisor` + Listing Generator (explainability, inventory-aware nudges)
- **Notebook LM + study bot** — inventory Q&A corpus + optional Slack “trivia” via Gemini: [NOTEBOOKLM-INVENTORY-BOT.md](./NOTEBOOKLM-INVENTORY-BOT.md)

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

1. **Portal UI / UX polish** — substantial refinement of core flows (see [UI-POLISH-VISION.md](./UI-POLISH-VISION.md)); use [GEMINI-UI-WALKTHROUGH.md](./GEMINI-UI-WALKTHROUGH.md) for visual reviews
2. **AI listing advisor** — stronger in-app experience around existing listing AI (guidance, explainability, inventory-aware suggestions); copy generation already shipped
3. **Notebook LM + random study bot** — inventory/tire-type Q&A grounded in exports + optional scheduled Slack prompts ([NOTEBOOKLM-INVENTORY-BOT.md](./NOTEBOOKLM-INVENTORY-BOT.md))
4. **Custom Skedaddle MCP server** — read-only Firestore for Cursor/Claude ([SKEDADDLE-MCP.md](./SKEDADDLE-MCP.md))

**Deferred:** eBay / SellerChamp ([EBAY-SELLERCHAMP-HANDOFF.md](./EBAY-SELLERCHAMP-HANDOFF.md)). **Shipped:** GitHub Actions CI (lint + build).

---

## Revenue Strategy

**Fastest path to cash:**
- Use Listing Generator → post to Facebook Marketplace, OfferUp, Craigslist, Nextdoor
- Priority SKUs: BFG KO3 265/70R17, 265/70R18, KM3 33s/35s, Michelin Agilis van sizes

**Medium term:**
- Google Business Profile (when ready to be searchable)
- Optional eBay listings — **only if revived** as a priority; not required for current strategy

**Automation:**
- AI listing advisor reduces posting effort per SKU
- eBay/SellerChamp remains **out of scope** until Phase 6 is unparked

**Highest value, slowest close:**
- Fleet contracts via Rubber CRM
- Target: I-25 HVAC fleets, Amazon DSPs, FedEx contractors, owner-operators
