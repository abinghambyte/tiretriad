# Skedaddle Portal — Full Product Roadmap

**Master spec (handoff / full context):** [SKEDADDLE-MASTER.md](./SKEDADDLE-MASTER.md) — phase numbers **6–8** below match that file.

**Project:** `skedaddle-portal` → deployed at `www.skedaddleinc.com` via Vercel  
**Repo:** `abinghambyte/skedaddleinc` (main branch auto-deploys to Vercel)  
**Firebase project:** `skedaddle-inventory` (us-central1, Gen2 functions)  
**Stack:** React + Vite + Tailwind, Firebase Auth + Firestore + Cloud Functions Gen2, Vercel

---

## Phase 1 — Close out
**Status: complete**

### 1.1 Remove dev test button *(done)*
- Removed the `{import.meta.env.DEV ? (...)}` block from `src/components/tires/SaleMessenger.jsx` (Step 1 verification UI).

### 1.2 Document env var pattern *(done)*
- `functions/.env` is gitignored — create from `functions/.env.example` on each machine; required: `NOTIFY_WEBHOOK_URL`, `NOTIFY_WEBHOOK_STYLE=slack`. See `docs/FIREBASE-GEN2-SENDTIRESALE-ENV.md`.

**Done when:** Clean production build with no dev artifacts, Slack posting confirmed working.

---

## Phase 2 — Slack interactivity
**Depends on:** Phase 1 complete  
**Status:** implemented in `functions/index.js` — deploy + Slack app wiring still required on your side.

### Context
When **`SLACK_BOT_TOKEN`** is set, **`sendTireSaleSms`** uses **`chat.postMessage`** with Block Kit (section + **Mark ready**), creates **`orders/{id}`** (`pending`), and stores **`slackMessageTs`**. If the bot token is unset, the callable falls back to **`NOTIFY_WEBHOOK_URL`** (plain text, no button).

### 2.1 Create Slack app with bot token *(you)*
- api.slack.com/apps → app with **`chat:write`**, **`chat:write.public`**
- Install to workspace → **`SLACK_BOT_TOKEN`**, **`SLACK_SIGNING_SECRET`** in **`functions/.env`**
- Optional: **`SLACK_CHANNEL_ID`** (`C…`) for `#fleet-ops` — invite the bot to that channel

### 2.2 Upgrade `sendTireSaleSms` *(done in repo)*
- Block Kit + **`action_id`:** `mark_ready`, **`value`:** Firestore order document id (created before post)

### 2.3 **`slackActions`** Gen2 HTTP *(done in repo)*
- **`onRequest`** — verify Slack signature, **`mark_ready`** → **`orders/{id}`** `status: ready`, **`updatedAt`**
- Interactivity Request URL: see [FIREBASE-GEN2-SENDTIRESALE-ENV.md](./FIREBASE-GEN2-SENDTIRESALE-ENV.md) (`…/slackActions`)
- Deploy **`firestore.rules`** so authenticated clients can **read** `orders` (writes remain Functions-only)

**Done when:** After deploy, clicking **Mark ready** in Slack updates the matching **`orders`** doc in Firestore (verify in console).

---

## Phase 3 — Firestore orders model
**Depends on:** Phase 2 in progress (can be built in parallel)

### 3.1 Schema: `orders/{id}`
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
assignedTo: string (uid from users collection)
assignedRole: "mechanic" | "supplier"
createdAt: Firestore timestamp
updatedAt: Firestore timestamp
slackMessageTs: string (Slack message timestamp for future message updates)
```

### 3.2 Write order on sale
- When `sendTireSaleSms` fires successfully, also write an `orders/{id}` doc with `status: "pending"`
- Pass the generated order ID into the Slack Block Kit button `value` field

### 3.3 Real-time portal sync
- Add `onSnapshot` listener in the portal UI on the `orders` collection
- Orders table updates without page refresh
- Filter by status, assignedTo, date

**Done when:** Submitting a tire sale creates a Firestore doc, portal table updates live, "Mark ready" in Slack flips status to "ready" and portal reflects it.

---

## Phase 4 — People System
**Depends on:** Phase 3 complete  
**This is the largest phase — build in sub-phases**

### 4.1 Roles and permissions model

Three roles at launch:
- `admin` — full portal access, People portal, invite others, promotable
- `supplier` — sees sale alerts for their brand, views order status (e.g. Kyle, Michelin rep)
- `mechanic` — sees orders assigned to them, marks fulfillment (e.g. DJ, road service)

Schema: `users/{uid}`
```
uid: Firebase Auth uid
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
inviteExpiry: Firestore timestamp
inviteDelivery: "sms" | "nfc" | "email"
inviteAccepted: boolean
createdAt: Firestore timestamp
lastLogin: Firestore timestamp
```

### 4.2 Admin — People portal UI
- Accessible only to users with `permissions.people: true`
- User list: name, role, invite status, last login, actions (renew, lock, promote)
- Create user form: first name, last name, email, phone, role, delivery method (SMS / NFC / email)
- On create: generate unique token, write `users/{uid}` doc with `inviteStatus: "active"`, set 48hr expiry
- Token controls per user row: Renew (extend 48hrs, no retyping), Lock (kill access immediately), Promote (change role)
- Renew does not require re-entering user details — one click from the user row

### 4.3 Invite token system
- Token URL format: `skedaddleinc.com/i/[token]` — short, reveals nothing
- Token stored in Firestore `invitedTokens/{token}` with reference to `users/{uid}`
- Server checks token state on every request — active/expired/locked all return different but equally minimal responses
- Expired or locked tap: blank page or single line, no explanation
- NFC cards hold the permanent token URL — card never needs reprogramming for expiry/renewal, only if reassigned to a different person
- Admin can reprogram card URL from the portal (generates new token, old one is locked)

### 4.4 Invite delivery

**SMS (primary)**
- Send via Twilio or Firebase Extensions phone auth
- Message: short, reads like a person sent it, includes token URL
- No platform name, no explanation, just the link

**NFC card (secondary — in person or mailed)**
- Portal generates the token URL for the card
- Admin programs card using any NFC writing app (portal shows the URL to copy)
- Card is handed over or mailed with no note, or a single word/phrase
- Card tap triggers the full entrance experience (see 4.5)

**Email (tertiary)**
- Plain text only, no template, no logo
- Subject line: a phrase, not a description
- Body: one or two lines max, token URL, nothing else

### 4.5 NFC tap entrance experience
This is the first impression for in-person and mailed card invites.

**Sequence:**
1. NFC tap → phone opens `skedaddleinc.com/i/[token]`
2. Web Vibration API: single sharp pulse (~200ms) on page load
3. Short audio tone plays on load (autoplay permitted because NFC tap counts as user gesture on Android; iOS PWA support later)
4. Black screen, ~500ms pause
5. A single white bolt renders center screen and tears diagonally across the viewport — fast, sharp, like a crack in glass (Framer Motion)
6. Black overlay peels away from the crack line revealing the page behind
7. Reveal: dark background, "Skedaddle" in clean type
8. Below: generative greeting — Anthropic API call with user's first name and role, returns a single line, always different, always includes their name

**Generative greeting tone parameters (pass to API):**
- Understated, slightly cryptic, never corporate, never exclamatory
- Always includes the user's first name
- Implies they were expected, not recruited
- Examples: "DJ. We've been expecting this." / "There you are, Kyle." / "The door was already open, DJ." / "You took your time, Kyle. That's fine."

**After reveal:**
- Single subtle CTA below the greeting — a word or an arrow, nothing more
- Leads into registration form

### 4.6 Registration form
- One field at a time if possible (step through: email → verify → name → phone → password)
- Email confirmation: 6-digit code sent to their email, entered on the same page — no separate inbox trip
- On complete:
  1. Firebase Auth account created with email + password
  2. `users/{uid}` doc updated with profile data, `inviteAccepted: true`
  3. `inviteTokens/{token}` marked used
  4. User redirected to their role-appropriate dashboard

**Done when:** Kyle and DJ can each tap a card or receive an SMS, register, and land on a dashboard appropriate to their role.

---

## Phase 5 — Role-based portal experience
**Depends on:** Phase 4 complete

### 5.1 Mechanic dashboard (DJ)
- Assigned orders list, sorted by recency
- Each order shows: tire details, customer, fulfillment type, status
- Can mark order ready or complete from the portal (mirrors Slack button)
- No access to tire margin tool, People portal, or fleet data

### 5.2 Supplier dashboard (Kyle)
- Incoming sale alerts for orders involving their brand
- Order status view — can see pending/ready/sold
- No access to admin features

### 5.3 Admin dashboard (you)
- Full access to all sections
- People portal
- Tire margin tool
- Orders table with all statuses
- Fleet data (future)

**Done when:** Each role logs in and sees only what they should see.

---

## Phase 6 — eBay listing integration
**Depends on:** Phase 3 complete

- eBay Developer Program — sandbox + production, REST API + OAuth 2.0
- From the listing generator, a **Post to eBay** flow creates a listing via API (title, description, price, qty, MSPN, category)
- Photo upload when tire photos exist in Storage
- Facebook / OfferUp / Craigslist: no automation — listing copy + manual paste only (see master spec §8)

**Done when:** A real listing can be created from the portal via eBay API (sandbox or prod as configured).

---

## Phase 7 — Portal polish
**Depends on:** Phase 3 complete, can be done alongside Phase 5

1. Orders table in portal — live Firestore status, filterable by status/assignee/date
2. CSV export from tire margin table
3. Bulk CTS edit
4. Saved filter presets for daily workflows
5. Slack cancel modal — hide/show “Other” note field via `dispatch_action` on disposition select (polish; current optional field + validation is fine for ops)

---

## Phase 8 — Hygiene
**Do before April 30, 2026** (Node 20 deprecation)

1. **Node runtime upgrade** — change `functions/package.json` engines from `20` to `22` and redeploy before April 30 deprecation deadline
2. **`firebase-functions` package upgrade** — flagged as outdated during Phase 1 deploy; read breaking changes before upgrading
3. **GitHub Actions CI** — lint + build check on every PR to main

---

## Open decisions (resolve before building the relevant phase)

| Decision | Phase | Options |
|---|---|---|
| Unify notify path (Firebase callable vs Cloud Run) | 2 | Firebase is working — stay unless there's a reason to move |
| SMS provider | 4 | Twilio vs Firebase phone auth extension |
| NFC card programming UX | 4 | Portal shows URL to copy vs direct NFC write API (browser NFC API is Chrome Android only) |
| Audio tone asset | 4.5 | Custom sound vs Web Audio API generated tone |
| Framer Motion vs CSS animation for bolt reveal | 4.5 | Framer Motion preferred for control |
| Email provider for 6-digit code | 4.6 | Resend vs SendGrid (both have free tiers) |
| eBay sandbox / developer account | 6 | Create before building Phase 6 |

---

## Current env vars reference

| Location | Var | Purpose |
|---|---|---|
| `functions/.env` | `NOTIFY_WEBHOOK_URL` | Slack #fleet-ops incoming webhook (current) |
| `functions/.env` | `NOTIFY_WEBHOOK_STYLE` | `slack` |
| `functions/.env` (Phase 2) | `SLACK_BOT_TOKEN` | Bot token for chat.postMessage |
| `functions/.env` (Phase 2) | `SLACK_SIGNING_SECRET` | Verify Slack action payloads |
| `functions/.env` (Phase 4) | `TWILIO_ACCOUNT_SID` | SMS invite delivery |
| `functions/.env` (Phase 4) | `TWILIO_AUTH_TOKEN` | SMS invite delivery |
| `functions/.env` (Phase 4) | `RESEND_API_KEY` | Email 6-digit confirmation code |
| `functions/.env` (Phase 4.5) | `ANTHROPIC_API_KEY` | Generative greeting on invite page |
