# Skedaddle Portal — Master Spec & Roadmap
> Hand this file to Cursor as your first message in any session. It contains full project context, current build state, and the complete phase roadmap.

---

## 1. Project Overview

A private, gated web portal at **skedaddleinc.com**. Dark minimal landing page with login. Authenticated users land on a dashboard housing internal tools as project cards. First tool live: **Skedaddle Tires** — a tire resale margin calculator, listing generator, and sale messenger.

**Repo:** `abinghambyte/skedaddleinc` → main branch auto-deploys to Vercel  
**Live URL:** `www.skedaddleinc.com`  
**Firebase project:** `skedaddle-inventory` (us-central1, Gen2 functions)  
**Stack:** React + Vite + Tailwind CSS, Firebase Auth + Firestore + Cloud Functions Gen2, Vercel

---

## 2. Firebase Config

```js
const firebaseConfig = {
  apiKey: "AIzaSyD_KDZm...",
  authDomain: "skedaddle-inventory.firebaseapp.com",
  projectId: "skedaddle-inventory",
  storageBucket: "skedaddle-inventory.firebasestorage.app",
  messagingSenderId: "469881157452",
  appId: "1:469881157452:web:6a99ab6bd091a3287581e9",
  measurementId: "G-2WQ1W7MCFD"
};
```

---

## 3. Project Structure

```
skedaddle-portal/
├── docs/
│   ├── SKEDADDLE-MASTER.md               ← this file (canonical handoff)
│   ├── ROADMAP.md
│   ├── TIRE-TOOL-PHASE2-ROADMAP.md
│   ├── FIREBASE-GEN2-SENDTIRESALE-ENV.md
│   └── CLOUD-RUN-NOTIFY-ENV-FIX.md
├── public/
├── scripts/
│   ├── seed-tires.mjs                    ← tire CSV import script
│   └── import-tires-csv.mjs
├── src/
│   ├── components/
│   │   ├── auth/LoginForm.jsx
│   │   ├── dashboard/Dashboard.jsx
│   │   ├── dashboard/ProjectCard.jsx
│   │   └── tires/
│   │       ├── TiresDashboard.jsx
│   │       ├── MarginTable.jsx
│   │       ├── MarginFilters.jsx
│   │       ├── ListingGenerator.jsx
│   │       └── SaleMessenger.jsx
│   ├── firebase/config.js
│   ├── hooks/
│   │   ├── useAuth.js
│   │   └── usePortalRegisteredUserCount.js
│   ├── pages/
│   │   ├── LandingPage.jsx
│   │   ├── DashboardPage.jsx
│   │   └── TiresPage.jsx
│   ├── routes/ProtectedRoute.jsx
│   └── utils/
│       ├── marginCalc.js
│       ├── listingGenerator.js
│       └── saleMessenger.js
├── functions/
│   ├── index.js                          ← Gen2 Firebase functions
│   ├── .env                              ← gitignored, create manually
│   └── .env.example
├── firebase.json
├── firestore.rules
├── package.json
├── vite.config.js
└── vercel.json
```

For **current phase status** and a shorter living checklist, use **`docs/ROADMAP.md`**; **`SKEDADDLE-MASTER.md`** (this file) remains the **canonical** spec and full roadmap.

---

## 4. Auth & Routing

- Firebase Auth email/password only
- Login is the only public route
- All routes behind `/dashboard` require auth via `ProtectedRoute`
- On login success → `/dashboard`
- On login fail → inline error, no redirect
- Users are created via invite flow (Phase 4) — no public signup

---

## 5. Tire Tool — Current State (live)

### 5.1 Firestore: `tires` collection

Document ID = `mspn` (string, keep leading zeros)

```
brand: string           // "MICHELIN"
tread: string           // "XLEZ"
mspn: string            // "03363"
description: string     // "11R22.5 X LEZ LRG"
lr: string              // "G" — store "" not null if empty
fet: number             // strip $ and parse float, store 0 if blank
price: number           // retail price — strip $ and parse float
cts: number             // cost to sell — manual or calculated
category: string        // "All Terrain" | "Highway" | "Commercial" etc.
useTags: array          // ["highway", "commercial", "long-haul"]
notes: string           // internal notes
```

### 5.2 CSV Import

File: `tires.csv` (1,162 rows, Michelin + BFGoodrich)  
CSV columns: `Brand, Tread, MSPN, Description, LR, FET, Price`

Import instructions for `scripts/seed-tires.mjs`:
- Use `mspn` as Firestore document ID — `db.collection('tires').doc(mspn).set({...})`
- Do not auto-generate IDs
- Skip rows where `mspn` is empty — log skipped rows with row number and reason
- Run in batches of 500 (Firestore batch write limit)
- Idempotent — `.set()` overwrites on re-run
- Spot check after import: query MSPN `13712` in Firestore console

### 5.3 Margin Calculator

Table columns: Brand, Description, MSPN, LR, CTS, Retail, Margin %, Category

Margin % = `((price - cts) / price) × 100`

Color badges:
- Red: < 15%
- Yellow: 15–24%
- Green: 25–34%
- Blue/Gold: 35%+

Filters: Brand, Category, Use Tag, LR, sliding margin % range  
Sort: margin %, brand, price  
Each row has a checkbox for listing generator selection

### 5.4 Listing Generator

Triggered by "Generate Listings" after selecting rows.

Input: selected tires, quantity per type, customer-facing price, platform target (Facebook / OfferUp / Craigslist / eBay)

Output per tire:
- **Title** (copy button): `4x Michelin 11R22.5 X LEZ LRG - [MSPN]`
- **Description** (copy button):

```
[qty]x [Brand] [Description] tires in great condition.

DOT: [random MM/YYYY within last 6 months] ✅

[Random reason for selling — pull from pool, no repeats per session]

[Use-case line based on category/tags]

💰 $[price] each / $[total] for the set
📦 SKU: [MSPN]

Local pickup or can arrange delivery. Message with questions!
```

Reason pool (expand to 20+):
- "Upgrading to a different spec for our fleet."
- "Ordered extras — don't need them all."
- "Bought more than we ended up needing."
- "Fleet downsize — these never got used."
- "Had these as backup — switching suppliers."
- "Switching tire sizes across the board."
- "These came in from a bulk order we're clearing out."
- "Bought a set to have on hand, ended up not needing them."
- "Clearing out storage space — priced to move."
- "Part of a larger lot we're breaking down."

### 5.5 Sale Messenger (`SaleMessenger.jsx`)

Button: "Log Sale / Notify Team"

Form fields: SKU (MSPN, autocomplete), quantity, price per tire, total (auto), customer name, customer contact, fulfillment (pickup/delivery toggle), notes

Firebase callable: `httpsCallable(functions, 'sendTireSaleSms')`  
Callable reads from `process.env` (Gen2): `NOTIFY_WEBHOOK_URL`, `NOTIFY_WEBHOOK_STYLE=slack`  
Posts plain-text to Slack `#fleet-ops` via incoming webhook (Rubber Signal app)

Current Slack message format (plain text):
```
🛞 TIRE SALE - Action Required

SKU: [mspn]
Qty: [quantity]
Price: $[per tire] each / $[total] total

Customer: [name]
Contact: [phone]
Fulfillment: [Pickup / Delivery]
Notes: [notes]

— Skedaddle Portal
```

**Phase 2 will upgrade this to Block Kit + bot token + interactive buttons.**

---

## 6. Functions: `functions/index.js`

- Gen2 Firebase Cloud Functions (`firebase-functions/v2`)
- Reads env via `process.env` only — `functions.config()` is NOT supported in Gen2, do not add it
- Deploy: `npm run deploy:functions` (uses local `./node_modules/.bin/firebase`)
- Env vars set in `functions/.env` (gitignored) — see `.env.example`
- Project default: `skedaddle-inventory` (set in `.firebaserc`)

Current env vars (`functions/.env`):
```
NOTIFY_WEBHOOK_URL=https://hooks.slack.com/services/...   # Slack #fleet-ops webhook
NOTIFY_WEBHOOK_STYLE=slack
```

---

## 7. People: Current Users

| Name | Role | Contact | Notes |
|---|---|---|---|
| Alex (you) | admin | boydabingham@gmail.com | Owner, full access |
| Kyle | supplier | — | Michelin rep, tire supplier |
| DJ | mechanic | — | Road service, order fulfillment |

---

## 8. Advertising Integrations

**eBay** — supported via eBay Developer Program (free). REST API + OAuth 2.0. Can programmatically create listings, set price/quantity/description, upload photos. Worth building in Phase 6.

**Facebook Marketplace, Craigslist, OfferUp** — no public APIs. Automation violates ToS and causes account bans. Do not build automation for these. The listing generator already produces optimized copy for manual paste — that is the correct approach for these platforms.

---

## 9. Full Phase Roadmap

### Phase 1 — Close out ✅ COMPLETE
- Dev test button removed from `SaleMessenger.jsx`
- Slack posting confirmed working end-to-end in production
- Git initialized, repo connected to Vercel, auto-deploy working
- Env var pattern documented in `docs/FIREBASE-GEN2-SENDTIRESALE-ENV.md`

---

### Phase 2 — Slack interactivity
**Depends on:** Phase 1 ✅

Current plain-text webhook does not support interactive buttons. This phase upgrades to Block Kit + `chat.postMessage` + bot token and adds an action handler function.

**2.1 Create Slack app with bot token**
- api.slack.com/apps → Create app → From scratch
- OAuth scopes: `chat:write`, `chat:write.public`
- Install to workspace → copy `xoxb-...` bot token
- Add to `functions/.env`:
  ```
  SLACK_BOT_TOKEN=xoxb-...
  SLACK_SIGNING_SECRET=...   # from app Basic Information page
  ```

**2.2 Upgrade `sendTireSaleSms` to Block Kit** *(implemented)*
- When **`SLACK_BOT_TOKEN`** is set: `chat.postMessage` (not incoming webhook), channel from **`SLACK_CHANNEL_ID`** / **`SLACK_NOTIFY_CHANNEL`** / default `#fleet-ops`
- Block Kit: section (sale details) + actions with **Mark ready**; `action_id`: **`mark_ready`**; **`value`**: Firestore **`orders/{id}`** document id (doc created as **`pending`** on each notify — ahead of full Phase 3 UI)
- If **`SLACK_BOT_TOKEN`** is unset: legacy **`NOTIFY_WEBHOOK_URL`** plain-text path (no button)
- Remove webhook-only path once bot flow is verified in production

**2.3 New Gen2 function: `slackActions`** *(implemented)*
- Type: `onRequest` (HTTP, not callable)
- Register as Slack app Request URL under Interactivity settings (URL in `docs/FIREBASE-GEN2-SENDTIRESALE-ENV.md`)
- On receive:
  1. Verify Slack signing secret — reject anything that fails
  2. Parse `payload` from request body
  3. Handle `action_id === "mark_ready"` only
  4. Write `status: "ready"`, `updatedAt: Timestamp.now()` to `orders/{orderId}`
  5. Return `200` empty body within 3 seconds — do Firestore write async if needed

**Done when:** Clicking "Mark ready" in `#fleet-ops` updates the Firestore order doc.

---

### Phase 3 — Firestore orders model
**Can be built in parallel with Phase 2**

**3.1 Schema: `orders/{id}`**
```
id: auto-generated
status: "pending" | "ready" | "sold"
mspn: string
quantity: number
pricePerTire: number
totalPrice: number
customerName: string
customerContact: string
fulfillment: "pickup" | "delivery"
fulfillmentNotes: string
additionalNotes: string
assignedTo: string              // uid from users collection
assignedRole: "mechanic" | "supplier"
createdAt: Firestore Timestamp
updatedAt: Firestore Timestamp
slackMessageTs: string          // Slack message ts for future message updates
```

**3.2 Write order on sale**
- When `sendTireSaleSms` fires successfully, write `orders/{id}` with `status: "pending"`
- Pass generated order ID into Slack Block Kit button `value`

**3.3 Real-time portal sync**
- `onSnapshot` listener on `orders` collection in portal UI
- Orders table updates without page refresh
- Filter by status, assignedTo, date

**Done when:** Sale → Firestore doc created → portal table live → "Mark ready" in Slack flips status → portal reflects it.

---

### Phase 4 — People System
**Depends on:** Phase 3 complete  
**Largest phase — build in sub-phases**

**4.1 Roles and permissions**

Roles at launch:
- `admin` — full access, People portal, invite others, promotable
- `supplier` — sees sale alerts for their brand, views order status (Kyle)
- `mechanic` — sees assigned orders, marks fulfillment (DJ)

Schema: `users/{uid}`
```
uid: string                     // Firebase Auth uid
firstName: string
lastName: string
email: string
phone: string
role: "admin" | "supplier" | "mechanic"
permissions: {
  tires: boolean
  orders: boolean
  fleet: boolean
  people: boolean
}
inviteToken: string
inviteStatus: "active" | "expired" | "locked" | "renewed"
inviteExpiry: Firestore Timestamp
inviteDelivery: "sms" | "nfc" | "email"
inviteAccepted: boolean
createdAt: Firestore Timestamp
lastLogin: Firestore Timestamp
```

Token registry: `inviteTokens/{token}`
```
token: string
uid: string                     // reference to users/{uid}
status: "active" | "expired" | "locked" | "renewed"
expiry: Firestore Timestamp
createdAt: Firestore Timestamp
usedAt: Firestore Timestamp
```

**4.2 Admin — People portal**
- Route: `/people` — accessible only to `permissions.people === true`
- User list: name, role, invite status, last login, action buttons
- Create user form: first name, last name, email, phone, role, delivery method
- On create: generate unique token → write `users` doc with `inviteStatus: "active"` → set 48hr expiry
- Per-user actions:
  - **Renew** — extend expiry 48hrs from now, one click, no retyping
  - **Lock** — immediately kill token access
  - **Promote** — change role
- NFC card view: shows token URL for the user so admin can copy and program the card

**4.3 Invite token system**
- Token URL: `skedaddleinc.com/i/[token]` — short, reveals nothing
- Server checks token state on every request
- Expired or locked response: blank or single line — no explanation
- NFC cards hold the permanent token URL — never needs reprogramming for expiry/renewal
- Reassigning card to new person: generate new token, lock old one, show new URL to program
- Token states control access, card URL stays constant

**4.4 Invite delivery**

SMS (primary):
- Provider: Twilio
- Message: short, reads like a person sent it, token URL only
- No platform name, no explanation
- `functions/.env`: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`

NFC card (secondary — in person or mailed):
- Portal shows token URL for admin to copy into any NFC writing app
- Card handed over or mailed — no note, or one word
- Tap triggers entrance experience (see 4.5)
- Browser NFC write API is Chrome Android only — portal shows URL to copy, does not write directly

Email (tertiary):
- Plain text only — no template, no logo, no HTML
- Subject: a phrase, not a description
- Body: one or two lines, token URL, nothing else
- Provider: Resend (free tier sufficient)
- `functions/.env`: `RESEND_API_KEY`

**4.5 NFC tap entrance experience**

Route: `/i/[token]` — server validates token state before rendering

Sequence:
1. NFC tap → phone opens `skedaddleinc.com/i/[token]`
2. Web Vibration API: single sharp pulse, ~200ms (Android; iOS needs PWA for this)
3. Short audio tone on load — autoplay works because NFC tap is a user gesture on Android
4. Black screen, ~500ms hold
5. Single white bolt renders center screen, tears diagonally across viewport — fast and sharp, like a crack in glass (use Framer Motion)
6. Black overlay peels away from the crack line
7. Reveal: dark background, "Skedaddle" in clean type
8. Below: generative greeting via Anthropic API — single line, always different, always includes their first name

Greeting tone parameters for API prompt:
- Understated, slightly cryptic, never corporate, never exclamatory
- Always uses their first name
- Implies they were expected, not recruited
- Never explains what Skedaddle is
- Examples: "DJ. We've been expecting this." / "There you are, Kyle." / "The door was already open, DJ." / "You took your time, Kyle. That's fine."

After reveal:
- Single subtle CTA — a word or arrow, nothing more
- Leads into registration form

Expired/locked token tap:
- Blank screen or a single neutral line
- No error message, no explanation, no branding

**4.6 Registration form**

Step-through, one field at a time:
1. Email
2. 6-digit code sent to that email (Resend), entered on same page — no separate inbox trip
3. First name, last name
4. Phone
5. Set password

On complete:
1. Firebase Auth account created with email + password
2. `users/{uid}` doc updated with profile, `inviteAccepted: true`, `lastLogin: now()`
3. `inviteTokens/{token}` marked used
4. Redirect to role-appropriate dashboard

**Done when:** Kyle and DJ can each receive an invite (SMS or NFC card), register, and land on a role-appropriate dashboard.

---

### Phase 5 — Role-based portal experience
**Depends on:** Phase 4 complete

**5.1 Mechanic dashboard (DJ)**
- Assigned orders list, sorted by recency
- Each order: tire details, customer, fulfillment type, status
- Can mark ready or complete from portal (mirrors Slack button)
- No access to: tire margin tool, People portal, fleet data

**5.2 Supplier dashboard (Kyle)**
- Incoming sale alerts for orders involving their brand
- Order status view: pending / ready / sold
- No access to admin features

**5.3 Admin dashboard (you)**
- Full access: all sections, People portal, tire tool, orders, fleet (future)

**Done when:** Each role logs in and sees only what they should see.

---

### Phase 6 — eBay listing integration
**Depends on:** Phase 3 complete

- eBay Developer Program — free sandbox + production, REST API + OAuth 2.0
- From the listing generator, "Post to eBay" button creates a real eBay listing via API
- Fields mapped: title, description, price, quantity, SKU (MSPN), category
- Photo upload: if tire photos exist in Firestore Storage, attach to listing
- Facebook Marketplace, Craigslist, OfferUp: no API — listing generator copy + manual paste is the correct approach, do not automate

---

### Phase 7 — Portal polish
**Depends on:** Phase 3 complete, can run alongside Phase 5

- Orders table: live Firestore status, filterable by status / assignee / date
- CSV export from tire margin table
- Bulk CTS edit
- Saved filter presets for daily workflows
- Slack cancel modal: optional “Other” note + validation is sufficient for now; later, hide/show note input with `dispatch_action` on disposition (Phase 7 polish)

---

### Phase 8 — Hygiene
**Do before April 30, 2026**

- Node runtime: change `functions/package.json` engines from `20` to `22` and redeploy — Node 20 deprecated April 30, decommissioned October 30
- `firebase-functions` package: flagged outdated during last deploy — read breaking changes before upgrading
- GitHub Actions CI: lint + build check on every PR to main

---

## 10. Open Decisions

| Decision | Phase | Notes |
|---|---|---|
| Unify notify path (Firebase callable vs Cloud Run) | 2 | Firebase callable is working and confirmed — stay unless reason to move |
| SMS provider | 4 | Twilio preferred — already in original spec |
| Audio tone for NFC entrance | 4.5 | Web Audio API generated tone vs custom audio file |
| Framer Motion vs CSS for bolt animation | 4.5 | Framer Motion preferred for timing control |
| Email provider for 6-digit code | 4.6 | Resend (free tier) vs SendGrid |
| eBay sandbox setup | 6 | Requires eBay Developer account — create before building |

---

## 11. Env Vars Reference

| File | Var | Purpose | Phase |
|---|---|---|---|
| `functions/.env` | `NOTIFY_WEBHOOK_URL` | Slack #fleet-ops incoming webhook | Live |
| `functions/.env` | `NOTIFY_WEBHOOK_STYLE` | `slack` | Live |
| `functions/.env` | `SLACK_BOT_TOKEN` | `chat.postMessage` bot token | 2 |
| `functions/.env` | `SLACK_SIGNING_SECRET` | Verify Slack action payloads | 2 |
| `functions/.env` | `TWILIO_ACCOUNT_SID` | SMS invite delivery | 4 |
| `functions/.env` | `TWILIO_AUTH_TOKEN` | SMS invite delivery | 4 |
| `functions/.env` | `TWILIO_FROM_NUMBER` | SMS from number | 4 |
| `functions/.env` | `RESEND_API_KEY` | Email 6-digit confirmation | 4 |
| `functions/.env` | `ANTHROPIC_API_KEY` | Generative greeting on invite page | 4.5 |

---

## 12. Known Issues & Notes

- Node 20 deprecated April 30, 2026 — upgrade to 22 before that date
- `firebase-functions` package flagged outdated — upgrade carefully, has breaking changes
- `functions.config()` is NOT supported in Gen2 — all env must come from `process.env` via `functions/.env`
- `api.github.com` is blocked at the egress proxy level in Claude's bash environment — direct API pushes from Claude will fail
- Cloud Run env vars are on a separate service and do not affect the Firebase callable — do not confuse the two
