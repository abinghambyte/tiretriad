# Skedaddle Portal — AI Session Context
**Read this first in every Claude or Antigravity session.**

## What this is
Private operations portal for a northern Colorado tire resale business.
Live at skedaddleinc.com | Repo: abinghambyte/skedaddleinc | Auto-deploys to Vercel on push to main.

## Stack
- Frontend: React 19 + Vite + Tailwind → Vercel
- Backend: Firebase Cloud Functions Gen2 (Node 22) → npm run deploy:firebase
- DB: Firestore (project: skedaddle-inventory)
- Auth: Firebase Auth
- External: Slack (Rubber Signal app / #fleet-ops), Sinch (SMS), Resend (email), Anthropic API, Gemini API

## Crew
- Alex (Overwatch/admin): boydabingham@gmail.com — owner, 50% of profit pool
- Kyle (Source/supplier): Michelin rep — charges Alex's card for tires, 10% of profit pool
- DJ (Field/mechanic): road service — fulfills orders, 20% of profit pool
- Tanner: silent partner — 20% of profit pool only. No operational role, no order fulfillment, no portal access. Do not invite. Do not assign orders or leads to him.

## Deploy commands
- Frontend: Vercel auto-deploy on push to `main` (git add / commit / push)
- Backend (Functions + Firestore rules/indexes): `npm run deploy:firebase` from repo root
- When both frontend and backend change: run `npm run lint && npm run build`, then `npm run deploy:firebase`, then push (so callable shapes match the UI)
- After every deploy, walk through post-deploy verification in detail

## Local HTTPS (Web NFC / People invite on a phone)
- `npm run dev` — HTTP (fine for most UI work)
- `npm run dev:https` — HTTPS with a self-signed dev cert (`@vitejs/plugin-basic-ssl`). Server binds `0.0.0.0` (`host: true`). On your Pixel, open `https://<PC-LAN-IP>:5173` and accept the certificate warning once.
- **Trusted local certs (optional):** use [mkcert](https://github.com/FiloSottile/mkcert) for `localhost` and your LAN IP, save PEMs under e.g. `.certs/`, then run the same dev command with `VITE_DEV_HTTPS=1` plus `VITE_SSL_KEY_PATH` and `VITE_SSL_CERT_PATH` (paths relative to repo root). Vite uses those files when present and skips basic-ssl.

## Secrets
- Slack secrets (SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SLACK_CHANNEL_ID, SLACK_KYLE_ID) live in Firebase Secret Manager — never in functions/.env
- All functions using Slack must import SLACK_SECRETS from functions/slackSecrets.js and use SLACK_BOT_TOKEN.value() — never process.env for Slack credentials
- To set or update a secret: firebase functions:secrets:set SECRET_NAME
- For local emulator use .secret.local, not .env

## Pricing model (critical — do not get this wrong)
- price field (Firestore) = Kyle's buy price per tire from CSV. Already populated for all 1,160 tires.
- fet field = Federal Excise Tax paid by Alex at purchase from Kyle. NOT tracked in customer-facing revenue.
- paymentAmount = total dollars the customer paid for the order. This is the revenue figure. No salePrice field — use paymentAmount.
- profit = (paymentAmount - buyPrice - mountCost - deliveryCost - otherCost) × qty
- FET washes out — never subtract FET in margin calcs.
- kylePriceOverride = used as buyPrice when set on an order, falls back to catalog price field.
- CTS = mountCost + deliveryCost + otherCost only. No FET.
- There is NO fixed retail price — customer price set per sale in Sale Messenger as paymentAmount.
- Tires are often sold before they are physically in inventory. qty can be zero or negative — never gate logic on qty > 0.

## Order lifecycle
5 happy-path stages: pending → available → scheduled → in_transit → completed
Plus 2 terminal off-ramps that can apply from any active stage: cancelled, rejected
Plus 1 pre-lifecycle state: prospective (pipeline lead, not yet a real sale)

Active-order filter (used by SMS routing, reminders, etc.):
ACTIVE_ORDER_STATUSES = {pending, available, scheduled, in_transit}
Cancellable statuses (orderWorkflow.js:41): pending, available, scheduled, in_transit, prospective

- prospective: logged from the catalog as a pipeline lead (`createProspectiveOrder` callable, functions/index.js:646). Customer contact not required. Skipped by active-order SMS/reminder filters. Dedicated Slack block (`buildProspectivePipelineBlocks`, functions/orderWorkflow.js:381).
- pending: real sale fired from the portal (`notifyTeamSlackBot`, functions/index.js:172), Slack notified
- available: Kyle confirmed availability (with optional price override)
- scheduled: delivery or pickup window set
- in_transit: DJ on the way
- completed: order done, paymentAmount recorded, revenue stats updated. Status written in exactly two places: `functions/index.js:474` (portal-driven completion) and `functions/fieldSlackCommands.js:220` (Slack `/done`). Both share `runCompletionTransaction` in `functions/financeStats.js`.
- cancelled: order pulled before fulfillment (any pre-completed stage; applies to prospective too)
- rejected: Kyle or ops declined; terminal, does not re-enter the pipeline

## Inventory qty accounting
`tires/{mspn}.qty` is *manually* managed by Kyle via `/intake [mspn] [qty]` — that is the **only** place in the codebase that writes `qty` (functions/inventorySlackCommands.js:101, `FieldValue.increment(delta)`). The order lifecycle never auto-decrements or restores `qty`. `runCompletionTransaction` (functions/financeStats.js:261) only updates analytics fields on the tire doc: `salesCount`, `lastSoldAt`, `weeklyVelocity`, `weeklyVelocityWeek`. Because qty is Kyle's reconciled physical count, cancelled/rejected orders correctly touch neither inventory nor revenue stats — there is no inventory-leak bug, and adding auto-restore logic would corrupt Kyle's counts.

## Dashboard structure (module cards + header)
Cards render in this order; **Growth Lab** and **Ops Command** are **admin (Overwatch) only** on the grid; **Credit Tracker** is a compact strip in the header for admins, not a grid card.

1. Skedaddle Tires → `/tires` (Catalog, Orders, Listing Generator)
2. Rubber CRM → `/crm` (Pipeline, Leads, DJ Dispatch) — NOT "Fleet CRM"
3. People Systems → `/people` (Crew + Customers + Availability Blocker; mobile crew invite supports copy URL + Web NFC + NFC Tools fallback)
4. Analytics → `/analytics` (Wall, Metrics, Revenue, Leaderboard)
5. Growth Lab → `/growth` — **Live**, Overwatch-only (`ProtectedRoute requireAdmin`): task dispatcher (Anthropic), session notes in `localStorage`
6. Ops Command → `/ops` (Expense Tracker, Tax Prep export, Reorder queue, Inbound SMS)
7. Credit Tracker → admin-only header widget on Dashboard (not a grid card)

## Slack slash commands (all point to slackActions URL)
Finance: /spoils, /owed, /payout, /revenue
Lookup: /stock, /margins, /pricecheck, /customer, /note, /weather, /quota, /hype, /setlimit, /setquota, /dispatch
Schedule: /delivery, /pickup, /reschedule, /schedule, /tomorrow, /week, /unscheduled, /openslots, /block, /unblock, /myavailability
Field: /onmyway, /done, /myorders, /sms, /confirm
Inventory: /intake, /reorder, /lowstock, /dead, /slowmovers, /velocity, /bestsellers, /forecast
Credit: /charge, /payment, /balance

## Key Firestore docs
- meta/creditTracker — card limit, current balance, pending charges, refund pipeline
- meta/revenueStats — running revenue/cost/margin totals by day/week/ytd/alltime
- meta/crewEarnings — totalEarned, totalPaid, balance per crew member
- meta/reorderQueue — pending reorder requests flagged for Kyle
- meta/quotaTargets — weeklyTarget, monthlyTarget for /quota command

## Key files
- functions/slackSecrets.js — all secret definitions; `SLACK_SECRETS`, `SLACK_ACTIONS_SECRETS`, `LISTING_ADVISOR_SECRETS`, etc.
- functions/taskDispatcher.js — Overwatch task routing callable (Growth Lab)
- functions/tirePriceResearch.js — nightly Gemini wholesale research + Slack
- functions/format.js — formatCurrency, formatNumber, formatPercent, formatQty, formatCurrencyOrDash
- src/utils/format.js — same formatters for frontend
- functions/financeStats.js — runCompletionTransaction, revenue stats, crew earnings
- functions/creditTrackerSlack.js — credit and lookup slash command handlers
- functions/financeSlackCommands.js — /spoils, /owed, /payout, /revenue
- functions/inventorySlackCommands.js — inventory slash commands
- functions/fieldSlackCommands.js — field slash commands
- functions/contactVip.js — VIP flag logic (3+ orders = isVip: true)
- functions/contactTireLabel.js — lastTireLabel written on completion
- src/utils/orderPoolMargin.js — pool and margin calc helpers
- src/utils/isoWeekDenver.js — Denver ISO week helpers
- src/utils/tireBeastMode.js — beast mode badge logic

## Key docs
- docs/ROADMAP.md — full feature roadmap with all phases
- docs/UI-POLISH-VISION.md — core vision: UI polish priorities
- docs/GEMINI-UI-WALKTHROUGH.md — Gemini + screenshots for visual UI review (preferred vs unit tests)
- docs/NOTEBOOKLM-INVENTORY-BOT.md — Notebook LM corpus + optional Slack study bot plan
- docs/SKEDADDLE-MCP.md — Firestore MCP design (developer tooling)
- docs/EBAY-SELLERCHAMP-HANDOFF.md — deferred eBay plan (not current priority)
- docs/SKEDADDLE-MASTER.md — deprecated historical spec only
- docs/PHASE9-FLEET-CRM-HANDOFF.md — CRM data model

## Active work (as of April 18 2026)
- **UI / UX polish** — primary product focus: clarity, hierarchy, role-appropriate surfaces ([UI-POLISH-VISION.md](./UI-POLISH-VISION.md)); visual QA via [GEMINI-UI-WALKTHROUGH.md](./GEMINI-UI-WALKTHROUGH.md)
- **AI listing advisor** — shipped (`listingAdvisor` + Listing Generator); next: stronger in-app guidance and explainability
- **Notebook LM + study bot** — inventory Q&A notebook + optional scheduled Slack questions ([NOTEBOOKLM-INVENTORY-BOT.md](./NOTEBOOKLM-INVENTORY-BOT.md))
- **Price intelligence** — `tirePriceResearch` nightly; `priceIntel.kyleConfirmed` freezes buy
- **GitHub Actions CI** — shipped (`.github/workflows/ci.yml`: lint + build; functions deps)
- **eBay / SellerChamp** — explicitly **not** a current priority (Phase 6 deferred)

## Rules for AI sessions
- Never rename "Rubber CRM" back to "Fleet CRM"
- Never add FET to CTS — it is already in price
- Never assume retailPrice field exists — it does not
- Never assume salePrice field exists — use paymentAmount
- Never subtract FET in margin or profit calcs — it washes out
- Never gate order or completion logic on qty > 0 — pre-sold inventory is valid
- Desktop layout must not change when adding mobile fixes — use max-sm: / sm: breakpoints
- Always run npm run lint and npm run build before declaring done
- Deploy functions before pushing frontend when both change
- firebase-functions is v7.2.5 — do not downgrade
- All Slack functions use .value() from slackSecrets.js — never process.env for Slack
