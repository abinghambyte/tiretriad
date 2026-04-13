# Skedaddle Portal — AI Session Context
**Read this first in every Claude or Antigravity session.**

## What this is
Private operations portal for a northern Colorado tire resale business.
Live at skedaddleinc.com | Repo: abinghambyte/skedaddleinc | Auto-deploys to Vercel on push to main.

## Stack
- Frontend: React 18 + Vite + Tailwind → Vercel
- Backend: Firebase Cloud Functions Gen2 (Node 22) → npm run deploy:firebase
- DB: Firestore (project: skedaddle-inventory)
- Auth: Firebase Auth
- External: Slack (Rubber Signal app / #fleet-ops), Sinch (SMS), Resend (email), Anthropic API

## Crew
- Alex (Overwatch/admin): boydabingham@gmail.com — owner, 50% of profit pool
- Kyle (Source/supplier): Michelin rep — charges Alex's card for tires, 10% of profit pool
- DJ (Field/mechanic): road service — fulfills orders, 20% of profit pool
- Tanner (Field/mechanic): road service — fulfills orders, 20% of profit pool

## Deploy commands
- Frontend: git add . && git commit -m "message" && git push
- Backend: npm run deploy:firebase (from project root)
- Both: npm run deploy:firebase then git push
- After every deploy, walk through post-deploy steps in detail

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
6 stages: pending → available → scheduled → in_transit → completed
- pending: sale fired from portal, Slack notified
- available: Kyle confirmed availability (with optional price override)
- scheduled: delivery or pickup window set
- in_transit: DJ on the way
- completed: order done, paymentAmount recorded, revenue stats updated

## Dashboard structure (7 cards in order)
1. Skedaddle Tires → /tires (Catalog, Orders, Listing Generator)
2. Rubber CRM → /crm (Pipeline, Leads, DJ Dispatch) — NOT "Fleet CRM"
3. People Systems → /people (Crew tab + Customers tab + Availability Blocker)
4. Analytics → /analytics (Wall tab, Metrics tab, Revenue tab, Leaderboard tab)
5. Growth Lab → LOCKED
6. Ops Command → /ops (Expense Tracker, Tax Prep Export, Reorder Queue, Inbound SMS)
7. Credit Tracker → admin only, embedded in Dashboard header (not a full card)

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
- functions/slackSecrets.js — all secret definitions, SLACK_SECRETS and SLACK_ACTIONS_SECRETS arrays
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
- docs/SKEDADDLE-MASTER.md — canonical project spec
- docs/PHASE9-FLEET-CRM-HANDOFF.md — CRM data model

## Active work (as of April 13 2026)
- AI listing advisor (Gemini) — planned next
- eBay via SellerChamp — planned
- GitHub Actions CI (lint + build on PRs) — decision pending

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
