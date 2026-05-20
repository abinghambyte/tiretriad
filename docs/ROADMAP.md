# Tire Triad Portal — Master Roadmap
**Last updated: May 20, 2026**
**Live at: app.tiretriad.com | Repo: abinghambyte/tiretriad | Legal entity: Front Range Rubber LLC**

> Brand: rebranded from Skedaddle Inc to the Front Range Rubber LLC + Tire Triad dual-brand structure in May 2026. Legacy `skedaddleinc.com` redirects to `app.tiretriad.com` until Phase 3 DNS cutover completes.

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

---

## Tire Triad rebrand & invite-onboarding hardening (May 2026)

Captured during the May 2026 Skedaddle → Tire Triad rebrand and the parallel push to actually onboard the first non-Alex user (Kyle). Real recipients tripped over rough edges in the invite flow that internal testing missed; this section tracks both what shipped and what's still outstanding.

### Shipped this cycle ✅

- **Dual-brand structure.** `Front Range Rubber LLC` as the legal entity, `Tire Triad` as the consumer brand. `BRAND` config in `src/config/brand.js` mirrored to `functions/brand.js`. Domains: `app.tiretriad.com` (portal) + `info.tiretriad.com` (transactional email, verified in Resend).
- **Three-ring triad logo.** Replaced the Skedaddle lightning bolt across `BrandBolt`, favicon, login glyph, and the invite email's hero band. Component name preserved so every existing consumer picks up the new glyph automatically.
- **Branded HTML invite email.** Dark-theme card, watermarked triad mark behind a `TIRE TRIAD` wordmark, `Verified registration link` badge, named-inviter subject (`Kyle, Alex set up your Tire Triad access`), expiry line, SPF/DKIM/DMARC trust signal in the footer, `Sent by Alex ~ Tire Triad initiation` lead. Inline styles + table layout for cross-client coverage.
- **SMS invite parity.** Inviter line in body, trust signal, graceful right-to-left degradation under the 280-char budget, Sinch batch id captured, error taxonomy (`invalid-number` / `carrier-rejected` / `rate-limited` / `auth-error` / `timeout` / `provider-error`), People modal shows `SMS sent...` / `SMS failed (...)` instead of generic Email copy.
- **Sinch inbound HMAC signature verification.** Accepts `X-Sinch-Webhook-Signature` (the actual header Sinch uses on our service plan) in addition to existing fallbacks. Shared secret in Firebase Secret Manager.
- **Real prices on mobile catalog.** `TireCardMobile` rebound to canonical selectors (`tireCatalogBuyNumber` / `tireCatalogRetailNumber` / enriched `listingMargin`) — was rendering `$0.00` on every row. `Test offer` CTA renamed to `Try a price`. HaggleSheet call site maps the same canonical values so the stress-test sheet shows real numbers.
- **People editor profile section.** Admin can edit First / Last / Email / Phone on a pending invitee without recreating the user. Email change is gated on `inviteAccepted=false` and synced to Firebase Auth so the two records can't diverge. Surfaces `auth/email-already-exists` and `auth/invalid-email` as actionable errors.
- **Invalid-invite recovery page.** `resolveInvite` returns a specific reason (`not-found` / `expired` / `used` / `revoked` / `accepted` / `no-user`); the InvitePage renders reason-specific copy with the triad mark and a clear next action, replacing the cryptic random-phrase fallback that read as a phishing landing on a corporate-managed device.
- **Pre-login Cloud Run IAM.** `resolveInvite`, `getInviteGreeting`, `sendInviteRegistrationCode`, `completeInviteRegistration` granted `allUsers / roles/run.invoker` so the recipient (who has no Auth account yet) can actually invoke them. `invoker: 'public'` added to the `onCall` configs to document intent and reapply on every deploy. `INVITE_DELIVERY_SECRETS` bound to `sendInviteRegistrationCode` so the verification-code email actually sends.
- **Wizard polish.** Step 4 phone now formats progressively (`+1 (970) 814-5253`) as the recipient types and submits as E.164. Step 5 password shows a live hint (`At least 8 characters` → amber `N more to go` → emerald `Looks good`). Both match the People admin entry pattern.
- **Mobile chrome fixes.** Bottom nav `Rubber CRM` label aligned with single-word siblings (fixed-height label row + justify-start). Next-to-Post modal footer pinned to bottom with safe-area inset padding. Modal panel switched from `min-h-screen` to `min-h-dvh` so iOS Safari's dynamic toolbar stops burying action footers.
- **Invite intro readability.** Door-opening animation now fades the white slit to transparent once the door rotates away, and a large translucent triad mark (420px, 18% opacity) fades in centered as a backdrop. Continue is a real pill button instead of a barely-visible underline.
- **Channel swap on existing invites.** Send via [Email / SMS / NFC] picker next to the Resend button in the user editor. Picking a new channel + Resend dispatches via that channel and persists the change to `user.inviteDelivery` so the next session opens with the new default. No more delete-and-recreate the user dance.
- **Multi-channel send.** Email + SMS button in the user editor. Fires both `resendInviteDelivery` calls in parallel via `Promise.allSettled`, aggregates results into a single toast covering all four outcomes (both sent / email-only / sms-only / both failed). Only renders when the user has both email and phone on file.
- **Wizard header clipping.** BrandBolt's glow shadow no longer bleeds into the top edge of the TIRE TRIAD wordmark in the registration wizard (gap-4 -> gap-6).
- **Live counts banner gated to real outages.** Dashboard signal-bar count queries now each have their own try/catch instead of sharing one. Non-admin permission-denies (Source / Field / Viewer roles can't read the users collection) degrade silently to zero counts; the red `Live counts unavailable` banner only fires when all four queries fail (real network outage).
- **Auto-grant `allUsers` invoker on pre-login callables post-deploy.** `scripts/grant-pre-login-invoker.mjs` reapplies the binding via gcloud after every `npm run deploy:firebase`. Idempotent. Stops the four-`gcloud`-commands-per-deploy fire drill we hit during Kyle's onboarding push.
- **Slack step dropped from the invite wizard.** Wizard down to 5 steps (Email, Code, Name, Phone, Password); password Finish drops the recipient straight into the handshake/dashboard flow. Jobs, updates, and schedules now live in the portal plus SMS alerts.
- **Auth displayName self-heal.** `updatePortalUser` runs the Auth displayName sync unconditionally on every save (skipping the actual write when Auth already matches) and tolerates an empty patch. ProfileDetailsEditor's Save button is always callable and switches to `Sync profile` when nothing's dirty, so any admin can repair their own missing displayName by opening their People row and clicking once.
- **Uniform phone formatting.** Every input and display surface routes phone numbers through `formatPhoneInputForDisplay`, so `+1 (970) 814-5253` is the format across People create, People edit, Contacts add, MechanicIntakePage, the InvitePage wizard, the CRM lead drawer, and toast messages. No more raw `+19708145253` E.164 or unformatted `9708145253` leaking through.
- **Em dashes dropped from user-facing strings.** Email-locked hint, catalog category tabs, Sales Advisor preset prompts, mobile avatar aria-label. Em dash retained as the established "no data" placeholder in TireCardMobile.
- **Per-channel `lastInviteDelivery` persistence.** Multi-channel sends now write to channel-keyed subfields (`lastInviteDelivery.email`, `lastInviteDelivery.sms`, `lastInviteDelivery.nfc`) via Firestore dot-path update, so SMS and Email each keep their own breadcrumb. LastDeliveryRow renders one status line per channel; falls back to the legacy single-row read for docs that haven't been updated since the migration.
- **`slackInviteUrl` dropped from `completeInviteRegistration`.** Wizard no longer reads it; cleaning up the unused field stops advertising a Slack dependency the flow no longer has.
- **Anonymous Auth pool cleaned.** Ran `cleanup-orphan-auth-users.mjs`; pool went from 205 to 2 (Alex + Kyle). 203 orphan anonymous records deleted. Nothing in the current codebase calls `signInAnonymously`, so the Anonymous provider can be disabled in Firebase Console to prevent future drift.

### Pending — medium priority

- **Customize Firebase Auth email templates.** Console-side work (Authentication → Templates) for verify-email / password-reset / email-change / MFA enrollment notification. Currently send from the unbranded `noreply@skedaddle-inventory.firebaseapp.com` with `Verify your email for skedaddle-inventory` literal subjects. Nothing in the portal triggers these flows today, but if email verification or password reset is ever enabled, the email arrives from the Firebase default sender. Set sender name = `Tire Triad`, From = `noreply@info.tiretriad.com`, rewrite subjects + bodies to drop `%APP_NAME%` references.
- **Disable the Anonymous Auth provider.** Firebase Console → Sign-in method → toggle Anonymous off. Nothing in the codebase calls `signInAnonymously`, so future-proof the Auth pool against drift now that we've cleaned it.
- **HMAC secret rotation for Sinch inbound webhook.** The current `SINCH_INBOUND_SHARED_SECRET` value passed through plaintext email to Sinch support during ticket `00MLP4-J9JMK` and through this chat. Rotate within the next few weeks: generate a fresh 64-char hex, update Sinch dashboard + Firebase Secret Manager, redeploy `inboundSms`.
- **Vercel project rename to `tiretriad`.** Started during the rebrand but not finished. Doesn't affect functionality (custom domain still resolves) — pure hygiene. Settings → General → Project Name.

### Pending — Phase 3 DNS cutover

Flip these the same week DNS for `skedaddleinc.com` redirects to `app.tiretriad.com`:

- `index.html` — `<link rel="canonical">` and `og:url` still point at `https://www.skedaddleinc.com/`
- `README.md` — `Live (invite-only): [skedaddleinc.com](https://skedaddleinc.com)`
- `scripts/run-quarterly-audit.mjs` — ROUTES array hardcodes `https://skedaddleinc.com/...`
- `scripts/audit-authenticated-capture.mjs` — `BASE = 'https://www.skedaddleinc.com'`
- `scripts/capture-auth-state.mjs` — `page.goto('https://www.skedaddleinc.com/...')`
- Eventually drop `BRAND.legacyApex` once analytics show no inbound traffic to the legacy apex.

### Intentional leftovers (do not "fix")

Confirmed during the May 2026 audit; touching these would break things:

- localStorage keys (`skedaddle-theme`, `skedaddle-tires-filters-open`, `skedaddle-tire-margin-presets-v1`, `skedaddle-advisor-mode-v1`, `skedaddle-sound-enabled`, `skedaddle-margin-record-pct`, `skedaddle-listing-reasons-used`)
- Internal event names (`skedaddle:tires-selection`, `skedaddle-close-overlays`)
- `window.__skedaddleSinchMounted` window-global guard
- Firebase project id `skedaddle-inventory` (immutable)
- Test fixture emails `@skedaddle.local`
- eFleet account strings `1580951 SKEDADDLE INC LOVELAND` in real Michelin data the parser must keep handling
- `salesAdvisor.test.mjs` regression guard `expect(prompt).not.toMatch(/Skedaddle/i)`
