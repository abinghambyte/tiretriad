# Patch O - VIP concierge magic-link (v1, admin-dispatched)

You are a Cursor agent shipping ONE patch from a parallel rollout. Four other patches (K, L, M, N) are in flight concurrently. Do not touch any file outside the scope below. See `docs/handoffs/README.md` for the full ownership map if needed.

**Merge coordination:** Patch N (`dispatch-kill`) also touches `src/App.jsx`. If N has not yet merged when your PR opens, the route block near line 80-90 may collide. Base this branch on latest `main` and re-pull once before opening. If N merged while you were working, rebase onto main so your added `/vip/:token` route sits in an App.jsx that already has the old `/dispatch` route removed.

## Goal

Ship a minimum-viable VIP concierge entry point. Admin generates a signed URL from a CRM account detail panel; the customer visits `https://<portal>/vip/:token`, the token is verified server-side, and the page renders a VIP-branded chat shell (Sinch chat widget with `brandText: "VIP concierge"` and the account ID attached to the chat context). No email / SMS delivery in v1 - admin copies the URL and sends it out-of-band. Signed-identity Sinch integration is a follow-up.

The point of v1: validate the URL-generation + token-verify + branded-chat flow end-to-end before wiring delivery infrastructure.

## Branch

`vip-magic-link-v1` (cut from latest `main`).

## Prerequisite (document in the PR body; does not block merge)

Before the feature works in production, the admin must set a new Firebase Functions secret:

```
firebase functions:secrets:set VIP_TOKEN_SECRET
```

The brief's Cloud Function code uses `defineSecret('VIP_TOKEN_SECRET')` and throws a clear error message if the secret is unset (not a generic 500). Locally the emulator reads from `.secret.local`. Add `VIP_TOKEN_SECRET` to `functions/.env.example` (commented out, like the other secrets).

## Context

- `src/App.jsx` is the route table. Authenticated routes sit inside a guard wrapper (find the existing pattern). The `/vip/:token` route must be PUBLIC - no auth guard, since the token IS the auth.
- `src/components/chat/SinchChatMount.jsx` is the existing Sinch integration. It already consumes `VITE_SINCH_CHAT_CLIENT_ID` and `VITE_SINCH_CHAT_PROJECT_ID`. Extend it to accept optional props `vipMode` (boolean) and `vipContext` (`{ accountId, displayName }`) that override the default brand text and attach context to the Sinch `metadata`. Do not refactor the existing anonymous code path.
- `src/components/crm/CrmAccountDetailPanel.jsx` is the slide-in panel that opens on account row click. The "Generate VIP link" button goes here next to the existing action buttons.
- `functions/.env.example` already lists the pattern for other secrets. Add `VIP_TOKEN_SECRET` commented out, with the same header comment as its neighbors.
- Secret Manager pattern: `defineSecret` is used throughout `functions/`. Reference `functions/crm.js` or any file that passes `secrets:` to an `onCall` wrapper.

## Scope (only touch these files)

- `src/App.jsx` - add `/vip/:token` as a public route outside the auth guard
- NEW: `src/pages/VipConciergePage.jsx` - the customer-facing page
- `src/components/chat/SinchChatMount.jsx` - accept the two new optional props, pass through to the Sinch widget init
- `src/components/crm/CrmAccountDetailPanel.jsx` - add the "Generate VIP link" button + copy-to-clipboard UX
- NEW: `functions/vipLinks.js` - token sign + verify + two callables
- NEW: `functions/vipLinks.test.mjs` - unit tests for sign / verify roundtrip + tamper / expiry cases
- `functions/index.js` - export the two new callables
- `functions/.env.example` - add the `VIP_TOKEN_SECRET` comment block
- NEW: `src/pages/VipConciergePage.test.jsx` - render test for valid token + invalid token branches

Do not touch the existing `createSinchChatLead` function. Do not touch any other CRM file.

## Tasks

### 1. Token module - `functions/vipLinks.js`

Use `jsonwebtoken` if it is already in `functions/package.json`. If not, use a hand-rolled HMAC-SHA256 signer / verifier (same primitives as existing Sinch webhook HMAC in `crm.js`); do not add an npm dep unless one is already there.

- `signVipToken({ accountId, tier, ttlMs, secret })` returns `<base64url-payload>.<base64url-sig>` where payload is `{ accountId, tier, exp: nowMs + ttlMs, iat: nowMs, v: 1 }`.
- `verifyVipToken(token, secret, nowMs)` returns `{ ok: true, payload }` or `{ ok: false, reason }` where reason is one of `'malformed'`, `'bad-signature'`, `'expired'`, `'wrong-version'`. Validate `exp > nowMs` and `v === 1`. Constant-time compare on the signature.

Default TTL: 72 hours. Tier values accepted in v1: `'standard'` and `'platinum'`; reject anything else with `invalid-argument`.

Two callables:

- `generateVipLink(request)` - admin-only (`request.auth.token.role === 'admin'` or throw `permission-denied`). Input: `{ accountId, tier }`. Reads the crmAccount doc to confirm it exists (throw `not-found` if not). Returns `{ token, url }` where `url = "${ORIGIN}/vip/${token}"`. `ORIGIN` comes from a `VITE`-style env or fall back to a Firestore `meta/config.portalOrigin`; do not hardcode a production URL.
- `verifyVipLink(request)` - public (no auth required). Input: `{ token }`. Returns `{ ok: true, account: { id, displayName, tier } }` on success or throws `invalid-argument` with the reason string from `verifyVipToken` on failure. Pulls the account doc fresh to respect any tier changes since the token was signed.

Both callables declare `secrets: [VIP_TOKEN_SECRET]` so Secret Manager injects it.

### 2. Route + page

- `src/App.jsx`: add `<Route path="/vip/:token" element={<VipConciergePage />} />` OUTSIDE whatever wraps authenticated routes. Reference the existing `/invite/:code` or `/handshake/:code` public routes if they exist as the pattern to copy.
- `src/pages/VipConciergePage.jsx`:
  - Read `token` from `useParams()`.
  - On mount: call `verifyVipLink({ token })` via `httpsCallable`. While loading, show a subtle "Verifying VIP access..." spinner.
  - On success: render a centered card with "Welcome to VIP concierge" + the `account.displayName` + a "Start chat" button that mounts `<SinchChatMount vipMode vipContext={{ accountId, displayName, tier }} />` below the card.
  - On failure (`expired`, `bad-signature`, etc.): render a friendly "This VIP link is no longer valid. Contact support if you received this link and it should still work." Card only - no chat mount.
  - Page-level styling: zinc-950 background matching the portal shell, no PortalChrome header (this page is customer-facing, not ops-facing).

### 3. Sinch mount extension

- `src/components/chat/SinchChatMount.jsx`: add two new props `vipMode` (default false) and `vipContext` (default null). When `vipMode` is true, set the Sinch init `brandText` to `'VIP concierge'` instead of the default. When `vipContext` is non-null, pass `{ accountId, tier, displayName }` through as `metadata` on the chat init (check the Sinch SDK surface for the exact field; if there is no direct `metadata` hook, attach via the pre-send-message hook that is already wired up to populate `pageUrl` / `referrer`).
- Do not change the existing anonymous behavior. New props default-false / default-null; existing mount sites stay identical.

### 4. CRM panel button

- `src/components/crm/CrmAccountDetailPanel.jsx`: add a "Generate VIP link" button in the footer action row (alongside whatever lead conversion / edit buttons exist today). On click:
  - Show a small inline dropdown to pick tier (`standard` or `platinum`). Default `standard`.
  - Call `generateVipLink({ accountId, tier })`.
  - On success: show the returned `url` in a read-only input with a "Copy" button next to it. Toast "VIP link copied" on copy. Show the expiry ("Expires in 72 hours") as a small caption.
  - On failure: toast the error message.
- Admin-role gate: the button is only rendered when `profile.role === 'admin'`.

### 5. Tests

- `functions/vipLinks.test.mjs`: round-trip sign then verify succeeds; verify with a tampered signature returns `bad-signature`; verify with `exp` in the past returns `expired`; verify with malformed payload returns `malformed`; verify with `v: 0` returns `wrong-version`. Five cases.
- `src/pages/VipConciergePage.test.jsx`: renders "Verifying" state, then renders the welcome card on mock verify-success, and renders the invalid-link card on mock verify-failure. Use React Testing Library; mock `httpsCallable` at the module boundary.

## Out of scope

- Email or SMS delivery of the VIP link. Admin copies the URL and sends it manually in v1.
- Signed-identity Sinch integration using `SINCH_CHAT_CLIENT_SECRET`. The current mount stays anonymous underneath; only the brand text and metadata change. Follow-up patch can wire signed identity once this flow is validated.
- Chat transcript persistence / association with the crmAccount doc.
- Token revocation. A leaked URL is reusable until it expires. For v1 this is acceptable since links are admin-dispatched.
- Rate limiting on `generateVipLink`. Admin-only gate is the defense in v1.
- UI to list previously generated VIP links. If the admin needs to re-send, they click "Generate VIP link" again.
- Changing the `brandText` copy on the main Sinch mount (still "Skedaddle chat" or whatever it is today).

## Validation (must all pass before PR)

```
./node_modules/.bin/vitest run
./node_modules/.bin/eslint src/App.jsx src/pages/VipConciergePage.jsx src/pages/VipConciergePage.test.jsx src/components/chat/SinchChatMount.jsx src/components/crm/CrmAccountDetailPanel.jsx functions/vipLinks.js functions/vipLinks.test.mjs functions/index.js
./node_modules/.bin/vite build
node --check functions/vipLinks.js
```

## PR

- Title: `VIP concierge v1: signed URLs + branded chat shell`
- Body: short summary, the `firebase functions:secrets:set VIP_TOKEN_SECRET` prerequisite in a "Before this works in production" block, Test plan checklist, and an explicit "Deferred to v2" list covering signed Sinch identity, email/SMS delivery, and revocation. No Claude trailers, no em dashes in published text.

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
