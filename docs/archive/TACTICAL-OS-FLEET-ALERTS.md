# Tactical OS: Fleet Alerts Integration

**Date:** April 11, 2026  
**Status:** Phase 1 (one-way notifications) in this repo; Phase 2 (Slack interactivity) planned.

Use this doc when prompting Cursor or aligning local work with live infrastructure.

---

## 1. Architectural decisions

- **Slack** was chosen over Discord for the long-term build.
  - **Reasoning:** Stronger fit for **Block Kit** (buttons, menus) and threading for a two-way logistics loop (e.g. Kyle confirms order / ready / delayed → Firestore → notify DJ).
- **Production** may expose notification logic via **Cloud Run** (`skedaddle-os-api`) with env vars on a service revision, per your Google Cloud setup.
- **This repository (`skedaddle-portal`)** implements the same **Slack webhook payload** pattern in **Firebase Cloud Functions** (`functions/index.js`, callable `sendTireSaleSms`). If prod is only on Cloud Run, keep behavior in sync or consolidate to one surface.

---

## 2. Infrastructure (live)

Environment variables on the **`skedaddle-os-api`** service (Google Cloud Console), as configured:

| Variable | Example / value | Purpose |
| :--- | :--- | :--- |
| `NOTIFY_WEBHOOK_URL` | `https://hooks.slack.com/services/...` | Posts alerts to the target Slack channel (e.g. `#fleet-ops`). |
| `NOTIFY_WEBHOOK_STYLE` | `slack` | Ensures outbound JSON uses Slack’s shape (`{ "text": "..." }` for incoming webhooks). |

**Note:** Current secrets live in **Google Cloud Console** (not committed). For **Firebase Functions** in this repo, set the same keys on the function’s runtime configuration when using `firebase deploy --only functions`.

---

## 3. Logic and workflow (Phase 1)

- **Trigger:** “Log sale / notify team” in the portal UI calls the callable **`sendTireSaleSms`** (name kept for compatibility); it is **not SMS** — it POSTs to the webhook(s).
- **Payload:** A standardized plain-text block (tire sale summary) is sent as Slack `text` when `NOTIFY_WEBHOOK_STYLE=slack`.
- **Shared roadmap:** `skedaddle-os-motive-sync` and `skedaddle-os-api` are positioned to share or mirror this notification path for sales and vehicle-health style alerts (document here so cross-service work stays coherent).

---

## 4. Next steps (Phase 2) — for Cursor / implementers

1. **Slack payload (already in this repo for Phase 1)**  
   Do **not** put Slack webhook JSON in `src/firebase/config.js` — that file is **Firebase client** config only.  
   Slack `{ "text": "..." }` formatting lives in **`functions/index.js`** (`postWebhook` when style is `slack`). Extend there (or in Cloud Run) for Block Kit `blocks` when you add interactivity.

2. **Slack interactivity**  
   Add an **HTTPS endpoint** (callable `onRequest` or Cloud Run route) as Slack’s **Interactivity Request URL**. Verify **Slack signing secret**, parse `payload`, update Firestore (e.g. `orders` / `portal` docs), optionally `chat.update` the parent message. Incoming webhooks alone cannot receive button clicks.

3. **Firestore rules**  
   Deploy and verify rules for anything the UI or Slack callbacks must read/write.  
   In this repo today: `portal/*` allows **authenticated read**; **client write is disabled** (`write: if false`). Phase 2 status updates from Slack should use the **Admin SDK** in a trusted backend (or tighten rules with care if you ever allow client writes).

4. **Local vs cloud**  
   If you run the API locally, mirror Cloud env keys in local `.env` / secrets as needed. Vite `VITE_*` keys are for the **browser** only — never put `NOTIFY_WEBHOOK_URL` in the client bundle.

---

## 5. Repository map (skedaddle-portal)

| Concern | Location |
| :--- | :--- |
| Slack / Discord webhook POST | `functions/index.js` |
| Callable invoked from UI | `sendTireSaleSms` → `httpsCallable(functions, 'sendTireSaleSms')` in `SaleMessenger.jsx` |
| Firebase web config (`VITE_*` + fallbacks) | `src/firebase/config.js` |
| Example function env | `functions/.env.example` |
| `portal/stats` (e.g. registered user count signal) | `firestore.rules` + `hooks/usePortalRegisteredUserCount.js` |

---

*Last aligned with repo: April 11, 2026. Update this file when prod moves fully to Cloud Run or when Phase 2 endpoints ship.*
