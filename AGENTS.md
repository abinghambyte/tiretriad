# Skedaddle Portal — Agent Rules
# These rules apply to every agent session in this repo (Cursor, Antigravity, Claude Code, etc.).
# Do not override them. For Antigravity-specific overrides, see GEMINI.md.

## First read
Always open `docs/AI-CONTEXT.md` at the start of substantive sessions — it is the canonical source for stack, crew, pricing, dashboard structure, slash commands, and module names. Also read `docs/ROADMAP.md` for phase plan before making recommendations that touch roadmap items.

## Project
Private ops portal for a northern Colorado tire resale business.
Live at skedaddleinc.com. Repo: abinghambyte/skedaddleinc.

## Stack
- React 19 + Vite + Tailwind CSS → Vercel (git push to deploy frontend)
- Firebase Cloud Functions Gen2 Node 22 → npm run deploy:firebase
- Firestore (project: skedaddle-inventory)
- firebase-functions v7.2.5 — do not downgrade

## Deploy
- Functions: npm run deploy:firebase (from repo root)
- Frontend: git add . && git commit -m "message" && git push
- Always run npm run lint && npm run build before declaring done
- Deploy functions before pushing frontend when both change
- After every deploy, walk through post-deploy verification steps in detail

## Secrets
- All Slack secrets (SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SLACK_CHANNEL_ID, SLACK_KYLE_ID) live in Firebase Secret Manager — never in functions/.env
- All functions using Slack must import SLACK_SECRETS from functions/slackSecrets.js
- Always use SLACK_BOT_TOKEN.value() — never process.env for Slack credentials
- To add or update a secret: firebase functions:secrets:set SECRET_NAME
- Local emulator uses .secret.local, not .env

## Pricing model — never get this wrong
- price field = Kyle's buy price per tire. Already populated in Firestore for all 1,160 tires.
- fet field = Federal Excise Tax paid by Alex at purchase from Kyle. NOT tracked in customer-facing revenue.
- paymentAmount = total dollars the customer paid for the order. This is the revenue field. No salePrice field exists.
- profit = (paymentAmount - buyPrice - mountCost - deliveryCost - otherCost) × qty
- FET washes out — never subtract FET in margin or profit calcs
- kylePriceOverride = used as buyPrice when set on an order, falls back to catalog price field
- CTS = mountCost + deliveryCost + otherCost only. FET is never part of CTS.
- No retailPrice field. No salePrice field. Customer price is set per sale as paymentAmount.
- Tires are often sold before physically in inventory. qty can be zero or negative — never gate logic on qty > 0.
- priceIntel.activeBuyPrice takes precedence over raw price field when present and > 0

## Order lifecycle
5 happy-path stages: pending → available → scheduled → in_transit → completed
Plus 2 terminal off-ramps that can apply from any active stage: cancelled, rejected

Active-order filter (used by SMS routing, reminders, etc.):
ACTIVE_ORDER_STATUSES = {pending, available, scheduled, in_transit}

- pending: sale fired from portal, Slack notified
- available: Kyle confirmed availability (with optional price override)
- scheduled: delivery or pickup window set
- in_transit: DJ on the way
- completed: order done, paymentAmount recorded, revenue stats updated
- cancelled: order pulled before fulfillment (any pre-completed stage)
- rejected: Kyle or ops declined; terminal, does not re-enter the pipeline

Never revert to the old 3-stage model (pending/ready/sold).

## Formatting
- All currency: formatCurrency from src/utils/format.js (frontend) or functions/format.js (backend)
- All percentages: formatPercent from same files
- All quantities: formatQty from same files — handles zero and negative (pre-sold) gracefully
- CSV exports use plain numeric strings — no currency symbols in exports

## UI rules
- Desktop layout must never change when adding mobile fixes
- Use max-sm: and sm: breakpoints only for mobile
- Crew tag labels in UI: Overwatch, Source, Field, Spotter — never raw values (admin, supplier, mechanic, viewer)
- Margin % color scale: red < 10%, amber 10–25%, green > 25%
- Modal close: always support Escape keypress and backdrop click to dismiss

## Naming — never change these
- "Rubber CRM" — never rename to "Fleet CRM" or anything else
- "paymentAmount" — never rename to salePrice or any other field
- "retailPrice" does not exist — do not introduce it
- SLACK_SECRETS from functions/slackSecrets.js — never inline secrets

## Crew and profit split
- Alex (Overwatch/admin): 50% of profit pool — boydabingham@gmail.com, owner
- Kyle (Source/supplier): 10% of profit pool — Michelin rep, charges Alex's card for tires
- DJ (Field/mechanic): 20% of profit pool — road service, fulfills orders
- Tanner: 20% of profit pool — silent partner. No operational role, no order fulfillment, no portal access. Never invite. Never assign orders or leads to him. Never add to People system.

## Key utility files — always use these, never duplicate
- src/utils/format.js — currency, percent, qty formatters
- src/utils/parseTireDescription.js — tire description parser
- src/utils/portalCrewTag.js — crew tag label mapper
- src/utils/orderPoolMargin.js — pool and margin calc helpers
- src/utils/isoWeekDenver.js — Denver ISO week helpers
- src/utils/crewEarningsLabels.js — crew display labels
- src/utils/tireBeastMode.js — beast mode badge logic
- functions/slackSecrets.js — all secret definitions (`SLACK_SECRETS`, `SLACK_ACTIONS_SECRETS`, `EBAY_SECRETS`; eBay `defineSecret` wired when GCP secrets exist — see comments in file)
- functions/format.js — server-side formatters
- functions/financeStats.js — runCompletionTransaction, revenue stats, crew earnings
- functions/tireCatalogBuy.js — buy price resolution (prefers priceIntel.activeBuyPrice)
- functions/creditTrackerSlack.js — credit and lookup slash command handlers
- functions/financeSlackCommands.js — /spoils, /owed, /payout, /revenue
- functions/inventorySlackCommands.js — inventory slash commands
- functions/fieldSlackCommands.js — field slash commands
- functions/contactVip.js — VIP flag logic (3+ orders = isVip: true)
- functions/contactTireLabel.js — lastTireLabel written on completion

## eBay
- eBay seller account: front-range-rubber
- eBay functions: `functions/ebayIntegration.js` (webhook logs + publish stub until Inventory API is wired)
- `EBAY_SECRETS` in `slackSecrets.js` — separate from `SLACK_SECRETS`; mount when Secret Manager has `EBAY_*` versions
- Publish price = AI recommended price + 12% markup for eBay fees (portal Listing Generator)
- Inventory sync: when live, `completeOrder` (or dedicated job) should decrement eBay qty — confirm before relying on it

## Growth Lab
- Route `/growth` — Overwatch (admin) only; matches `ProtectedRoute requireAdmin` and dashboard card `adminOnly`
- Callable `growthLabTaskDispatch` — Anthropic Sonnet JSON routing; secrets via `slackSecrets` patterns

## Price Intelligence
- tirePriceResearch runs nightly at 2am Denver — never modify schedule without approval
- priceIntel.kyleConfirmed = true freezes activeBuyPrice — never overwrite automatically
- Flag threshold: 15% delta triggers human review, never auto-updates
- All price changes logged to priceIntel.sources array — never delete history

## Code style
- Prefer existing patterns; avoid drive-by refactors unrelated to the task
- When the task touches UI numbers, use formatCurrency / formatPercent / formatQty from src/utils/format.js
