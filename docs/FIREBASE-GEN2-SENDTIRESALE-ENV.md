# Firebase Gen2: `sendTireSaleSms` → Slack (`NOTIFY_WEBHOOK_URL`)

The portal calls **`sendTireSaleSms`** as a **Firebase Callable** (HTTPS) in project **`skedaddle-inventory`**, region **`us-central1`**. The implementation is **2nd gen** (`firebase-functions/v2/https`).

## What the code reads

`functions/index.js` uses **`process.env` only** — not `functions.config()`:

| Variable | Required | Purpose |
| :--- | :--- | :--- |
| **`NOTIFY_WEBHOOK_URL`** | Yes (for Slack) | Slack Incoming Webhook URL (`https://hooks.slack.com/services/...`). |
| **`NOTIFY_WEBHOOK_URL_2`** | No | Optional second webhook. |
| **`NOTIFY_WEBHOOK_STYLE`** | No | Defaults to **`slack`**. Must be the style keyword only: `slack`, `discord`, or `generic` — **never** paste the webhook URL here. |

If **`NOTIFY_WEBHOOK_URL`** is unset, the callable throws **`failed-precondition`** with a clear message (not a silent failure).

## What *not* to use for Gen2

**`firebase functions:config:set`** is the **legacy 1st gen** runtime config API. It does **not** populate `process.env` for **2nd gen** functions the way a `.env` file or Cloud console variables do. Do **not** assume `notify.webhook_url` from `config:set` reaches this code unless you maintain a separate bridge (this repo does not).

## How to set env vars (pick one)

### A. `functions/.env` + deploy (good for teams using the CLI)

1. Copy `functions/.env.example` to **`functions/.env`** (that path is covered by the repo root `.gitignore` for `.env`).
2. Set **`NOTIFY_WEBHOOK_URL=`** to your Slack incoming webhook (channel should be **`#fleet-ops`** — confirm in Slack → Apps → **Incoming Webhooks**).
3. Set **`NOTIFY_WEBHOOK_STYLE=slack`** if you want to be explicit (otherwise the code defaults to `slack`).
4. From the repo root (project is already **`skedaddle-inventory`** in `.firebaserc`):

   ```bash
   firebase login
   npm run deploy:functions
   ```

   If `npx -y firebase-tools@latest` fails on Windows with **`Cannot find module 'async'`** (broken global/npx cache), use the repo’s **`firebase-tools`** devDependency instead: `npm run deploy:functions`.

The Firebase CLI applies variables from **`functions/.env`** to the deployed Gen2 function’s runtime configuration. Only include **`NOTIFY_WEBHOOK_URL=`** in that file when the value is the full Slack URL; omit the line or leave a comment placeholder until then, so a deploy does not push an empty URL over an existing console-set value.

### B. Google Cloud Console (no local `.env`)

Gen2 callables run on **Cloud Run** under the hood.

1. Open [Google Cloud Console](https://console.cloud.google.com/) → select project **`skedaddle-inventory`**.
2. Go to **Cloud Run** (or **Cloud Functions** and open the function, then follow the link to the underlying service).
3. Find the service for **`sendTireSaleSms`** (name may appear in lowercase, e.g. `sendtiresalesms`).
4. **Edit & deploy new revision** → **Variables & secrets** (or **Container** → environment variables).
5. Add **`NOTIFY_WEBHOOK_URL`** = your Slack webhook URL; add **`NOTIFY_WEBHOOK_STYLE`** = `slack` if needed.
6. Save so a new revision rolls out.

**Note:** If you later deploy again **without** the same variables in `functions/.env`, the CLI deploy can overwrite runtime env depending on your setup — keep **`.env` for deploy** and console in sync, or standardize on one approach.

### C. Secret Manager (strongest for production)

For webhooks, Google’s recommended pattern is **`defineSecret`** in code plus `firebase functions:secrets:set`. This repo currently expects plain **`process.env`**; migrating to `defineSecret` would be a small code change in a follow-up.

## Slack channel: `#fleet-ops`

Incoming webhooks are **per channel**. In Slack, open **Settings** for the workspace/app → **Incoming Webhooks** → confirm the integration posts to **`#fleet-ops`**. If not, create a webhook for that channel and paste the new URL into **`NOTIFY_WEBHOOK_URL`**.

## CORS / 404 vs env

- **Wrong project, region, or function name** in the client Firebase config can produce **404**-like errors from the callable endpoint.
- **CORS preflight failures** often show up when the browser cannot complete an `OPTIONS` request to the functions URL (wrong URL, network block, or edge cases). Fixing **`NOTIFY_WEBHOOK_URL`** fixes the **Slack** path; it does not by itself fix a **404** from a non-existent or mis-addressed function. After env is correct, redeploy and confirm the callable exists under **`us-central1`** for **`skedaddle-inventory`**.

## Related docs

- [TIRE-TOOL-PHASE2-ROADMAP.md](./TIRE-TOOL-PHASE2-ROADMAP.md) — end-to-end verify steps.
- [CLOUD-RUN-NOTIFY-ENV-FIX.md](./CLOUD-RUN-NOTIFY-ENV-FIX.md) — URL vs `NOTIFY_WEBHOOK_STYLE` (also applies to the same env **names** on this function).
