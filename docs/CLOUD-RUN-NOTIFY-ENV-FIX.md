# Cloud Run: fix Slack webhook env (NOTIFY_WEBHOOK_URL vs NOTIFY_WEBHOOK_STYLE)

Use this when **`skedaddle-os-api`** (or similar) on **Cloud Run** is the service that posts to Slack, and messages never appear in `#fleet-ops`.

---

## What went wrong

1. **`NOTIFY_WEBHOOK_URL` was missing** — the code (this repo’s `functions/index.js` and any Cloud Run port of the same logic) reads **`process.env.NOTIFY_WEBHOOK_URL`** for the `https://hooks.slack.com/services/...` URL.
2. **The webhook URL was stored under the wrong name** — e.g. **`NOTIFY_WEBHOOK_STYLE`** (or “Name 8”) contained the full Slack URL. **`NOTIFY_WEBHOOK_STYLE`** must be a **style keyword only**: `slack`, `discord`, or `generic` — **not** a URL.

---

## Correct Cloud Run variables

| Name | Example value | Purpose |
| :--- | :--- | :--- |
| **`NOTIFY_WEBHOOK_URL`** | `https://hooks.slack.com/services/T0AS8NZHYT/B0xxxxx/xxxxx` | Slack incoming webhook URL (secret — treat like a password). |
| **`NOTIFY_WEBHOOK_STYLE`** | `slack` | Tells the code to POST JSON `{ "text": "..." }` (Slack). Use `discord` only if the URL is a Discord webhook. |

Optional second channel / backup:

| **`NOTIFY_WEBHOOK_URL_2`** | second `https://hooks.slack.com/...` | Same as above, optional. |

---

## Fix steps (Google Cloud Console)

1. Open **Google Cloud Console** → **Cloud Run** → select service (**e.g. `skedaddle-os-api`**) → **Edit & deploy new revision**.
2. **Variables & secrets** → **Add variable**:
   - **Name:** `NOTIFY_WEBHOOK_URL`
   - **Value:** paste the full Slack URL (copy it from wherever it was wrongly stored, e.g. the old `NOTIFY_WEBHOOK_STYLE` value).
3. **Edit** the wrongly set variable:
   - **`NOTIFY_WEBHOOK_STYLE`** → set value to exactly: **`slack`** (no URL, no quotes in the value field beyond what the UI needs).
4. **Remove** or clear any duplicate env entry that still holds a URL under the wrong key, so only **`NOTIFY_WEBHOOK_URL`** holds the hook URL.
5. **Deploy** the new revision (required — env changes apply on deploy).
6. In **Slack**: Server settings → **Integrations** → **Incoming Webhooks** — ensure the webhook is tied to **`#fleet-ops`** (or create a new webhook for that channel and paste **that** URL into `NOTIFY_WEBHOOK_URL`).
7. **Test** from whatever client actually hits **this** Cloud Run service (see below).

---

## Critical: portal vs Cloud Run

**`skedaddle-portal` today** calls the **Firebase callable** `sendTireSaleSms` (`httpsCallable` in `SaleMessenger.jsx`), **not** Cloud Run by default.

- Fixing **only** Cloud Run env makes **Cloud Run** correct.
- The **Vercel portal** will still talk to **Firebase Functions** unless you change the client to **`fetch(<Cloud Run URL>, …)`** (Step 2 in the roadmap).

So:

- If **prod notify = Cloud Run only:** set env on Run **and** point the UI (or a BFF) at that URL; Firebase callable can be retired or unused.
- If **prod notify = Firebase callable:** set **`NOTIFY_WEBHOOK_URL`** on the **Firebase Gen2** function (via **`functions/.env`** at deploy or **GCP** env on the Cloud Run service backing the function). **`firebase functions:config:set`** does not populate `process.env` for Gen2 — see [FIREBASE-GEN2-SENDTIRESALE-ENV.md](./FIREBASE-GEN2-SENDTIRESALE-ENV.md).

---

## Slack: point webhook at `#fleet-ops`

1. Slack → your workspace → **Apps** or **Server Settings** → **Integrations** → **Incoming Webhooks**.
2. Add or edit a webhook → choose channel **`#fleet-ops`** → copy the new URL if you rotated it.
3. Put that URL in **`NOTIFY_WEBHOOK_URL`** on Cloud Run (and redeploy).

---

*Related: [TIRE-TOOL-PHASE2-ROADMAP.md](./TIRE-TOOL-PHASE2-ROADMAP.md), [TACTICAL-OS-FLEET-ALERTS.md](./TACTICAL-OS-FLEET-ALERTS.md)*
