# Skedaddle Portal Roadmap

Unimplemented work that has come up in build sessions. Each item has enough
context to pick up cold. Move to a PR + delete the entry when shipped.

## Foundational blockers

These gate multiple items below. None are on deck yet.

### Customer-facing auth (v1 shipped)
Signed short-lived `/vip/:token` links shipped in PR #73 (`vip-magic-link-v1`).
`functions/vipLinks.js` signs and verifies HMAC-SHA256 tokens (72h TTL,
admin-only generator callable, public verifier callable). Admin dispatches
the URL out-of-band; the customer visits `/vip/:token` and the portal renders
a VIP-branded Sinch shell. Still deferred: email/SMS delivery, signed-identity
Sinch binding (so the conversation persists against a stable uuid across
sessions), token revocation, and rate limiting on generation. Order
self-serve still needs its own surface on top of this pattern.

### Public lead-capture page
`<SinchChatMount />` exists but is not wired into any page. Candidates
for a first mount point (all real public surfaces in the portal):

- `/intake/mechanic`: existing 5-step mobile-mechanic onboarding form.
  High-intent visitors, small audience but real. Best if the widget is
  positioned bottom-left so it does not overlap the form's Next button.
- `/i/:token`: invite landing after someone receives a crew invite SMS.
  Very narrow audience; adding chat here only useful for
  "my invite link is broken" support.
- A new `/contact` or `/about` page built specifically for lead capture.
  Zero exists today; would need design + copy.

Until a mount lands, the Cloud Function `createSinchChatLead` sits ready
but unused.

## Active queue

### AI sales advisor drawer
Context-aware advisor that can read the full tire catalog + completed orders
and surface suggestions inline on the Tires page (right-side drawer).
Should answer questions like:
- Which slow-moving tires should I push next?
- Which customers bought 4x recently and might repeat?
- What's my best quote for this fleet size + location?

Implementation notes:
- Gemini or Anthropic, reuse the existing `ANTHROPIC_API_KEY` Secret Manager
  entry.
- New Cloud Function `salesAdvisorChat` that hydrates context (catalog
  summary, completed-order stats, optional selected-tire detail) and calls
  the model.
- Drawer UI on Tires page, reachable via `?` key or a fixed button.
- Streaming response if the model path supports it; otherwise a single
  response with visible loading state.

### Command palette action upgrade
Today the palette (Cmd+K) is search-only. Add action commands alongside the
existing tire/order/customer search:
- `Log sale for <selected tire>` (opens Sale Messenger pre-filled)
- `Add tire order` (opens a new-order form)
- `Quote <MSPN>` (opens Quote Calculator)
- `Go to <page>` (Dashboard / Tires / CRM / People / Analytics / Ops /
  Admin)
- `Toggle dark mode`
- `Sign out`
Sections: search hits, navigation, actions. Actions filter by permission
(`permissionFor('tires')`, etc.) and selected context (1 tire selected
unlocks Log sale / Quote; 0 selected hides them).

### eBay sell-side API integration
See `memory/reference_ebay_developer_program.md` for the research doc.
Skedaddle-specific plan notes include:
- API scope: sell-side (Inventory API + Listing API + Order API)
- OAuth: application scopes + user tokens
- Growth gates: listing limit increases require positive-feedback history
  before eBay lifts caps
- Approach: start by listing 10-20 high-margin MICHELIN 22.5 commercials
  (mirror what Top Opportunities shows) to build history, then scale

Concrete next steps:
1. Register Skedaddle as an eBay developer + get production app keys.
2. New Cloud Function `ebayListingPublish` that accepts a tire row and
   publishes to eBay inventory + creates a listing offer.
3. Wire to the existing bulk-select toolbar (`Generate listings` already
   exists - add an eBay target alongside Facebook Marketplace /
   Craigslist / etc.).
4. Track eBay listing status in a new `priceIntel.ebay` field or a
   `tireListings` subcollection.

### VIP concierge surface (v1 shipped)
Shipped in PR #73 (`vip-magic-link-v1`). Admin clicks "Generate VIP link" on
the CRM account detail panel, picks a tier, copies the signed URL, and sends
it out-of-band. Customer lands on `/vip/:token` (public route) and sees a
VIP-branded Sinch shell with the account context attached as metadata. Still
deferred:
- Email/SMS delivery pipeline (v1 is admin copy-paste only).
- Signed-identity Sinch binding via `SINCH_CHAT_CLIENT_SECRET` so
  conversations persist against a stable uuid across sessions. v1 stays
  anonymous underneath the branded shell.
- Priority routing / dedicated VIP queue on the Sinch side.
- Token revocation (leaked URLs are reusable until the 72h TTL elapses).
- Rate limiting on `generateVipLink` beyond the admin-role gate.
- `vipTier` field on `crmAccounts` (v1 accepts `standard`/`platinum` on the
  token payload but does not persist a tier on the account doc).

### Sinch Chat: surface new lead fields in Leads UI (resolved)
Shipped in PR #69 (`sinch-lead-drawer`). Leads table gained a source pill,
inquiry preview column, and a right-side detail drawer showing contact,
inquiry, page URL, referrer, and `sinchConversationId`. The "open Sinch
inbox" deep link was deliberately skipped because Sinch does not expose a
stable conversation URL pattern; revisit if Sinch publishes one.

### Description-search format mismatch (resolved)
Shipped in PR #71 (`tire-haystack-v2`). `src/utils/tireSearchHaystack.js`
now strips slash-attached sidewall codes (`/BSW`, `/OWL`, etc.), normalizes
load-range suffixes (collapses `225/75R16 E` into `LR-E` form), and
preserves speed-rating letters through `normalizeTokens`. Regression
fixtures live in `src/utils/tireSearchHaystack.fixtures.js`.

## Queued operational tasks (your action, not code)

### Sinch US A2P 10DLC registration
Campaign submitted 2026-04-15 via Sinch dashboard (registration id
`01kp9nnfdzpantwsazm6a9xt70`, brand `BOTOVPS`, use case `LOW_VOLUME`).
Status currently `Pending Review`. Outbound SMS stays blocked (error 300
from T-Mobile) until the campaign clears TCR. Expected 1-3 business days
from submission.

### Firebase refresh token rotation
An earlier Claude session asked for the Firebase auth blob from IndexedDB
to drive a preview-browser walkthrough. The refresh token lives in that
session's history. Sign out + back in on the normal browser when
convenient; that invalidates the old refresh token.

### Sinch Chat frontend env vars
After a mount location is picked and `<SinchChatMount />` is imported,
populate these two VITE vars in your deployment env (Vercel / local
`.env`):
- `VITE_SINCH_CHAT_CLIENT_ID` = from Sinch dashboard
- `VITE_SINCH_CHAT_PROJECT_ID` = from Sinch dashboard

## Deferred / explicitly parked

### Field crew intake via Sinch Chat
Replacing the "Quick debrief (optional)" form at the bottom of completed
orders with a Sinch conversation. Upside: threads, media, agent replies.
Downside: overlaps with Slack which crew already uses. Parked to avoid
fragmenting internal comms.

### Mechanic/installer SOS
Contractor-facing chat from a job detail page. Low volume, not worth
building until customer-facing auth exists and there is evidence of
demand.

### Invite-flow chat escape hatch
"Your invite isn't working?" chat on `/invite/:code` /
`/handshake/:code`. Small value add, hold unless invite-completion
conversion becomes a measured problem.

## Unfinished / ambiguous pieces surfaced during audit

### `/dispatch` placeholder vs. external Workforce app (resolved)
Killed in PR #70 (`dispatch-kill`). The `/dispatch` route and
`DispatchRedirect.jsx` stub are gone; a permanent "coming back soon" sign
reads worse than an honest 404. `WORKFORCE_URL` stays in
`src/constants/externalUrls.ts` because Growth Lab still links to the
external app. The `/crm/dispatch` redirect (CRM Field Dispatch tab) is
unrelated and unchanged.

### "DJ streak" and "DJ dispatch" copy decision (resolved)
Role-neutral rename landed inline before batch 3. JS symbols in
`src/pages/AnalyticsPage.jsx` went from `djStats` / `djStreakUi` /
`djAssignedStreakDays` to `fieldStats` / `fieldStreakUi` /
`fieldAssignedStreakDays`; the `meta/djStats` Firestore doc name was
deliberately kept to avoid a schema migration (orderLifecycle,
phase5Scheduled, orderWorkflow tests all read it). The CRM "DJ Dispatch"
tab comment was rewritten to "Field dispatch tab". Any remaining
user-visible "DJ" strings are intentional product copy.

### Listing advisor vs. invite greeting model drift (resolved)
Functions had drifted: invite greeting on `claude-sonnet-4-6` (current),
listing advisor fallback on `claude-sonnet-4-5` (one version behind).
Bumped advisor fallback to `claude-sonnet-4-6` for consistency in the
same PR that created this ROADMAP entry. Any future model bumps should
touch all four call sites: `functions/inviteFlow.js`,
`functions/listingAdvisor.js`, `functions/taskDispatcher.js`,
`functions/lookupUtilitySlackCommands.js`.

### Analytics revenue weekly chart x-axis labels (resolved)
`MARGIN TREND (WEEKLY)` chart on the Revenue tab now labels the x-axis
`W06 W07 ... W17`. Chart tooltips and the top-right latest-week pill
dropped the redundant `Week` prefix so they read `W15 100.0%` instead
of `Week W15 100.0%`.

### Analytics MTD / WTD revenue tiles (resolved + backfill shipped)
Root-caused: the one existing completed order (April 12) pre-dated
commit `a8dbec2` (April 13) which wired `runCompletionTransaction` to
update `meta/revenueStats`. The doc is legitimately empty until the
next completion fires. The UI now distinguishes "doc alive, this
period is zero" (shows `$0.00` with clarifying hint) from "doc never
populated" (shows em-dash with "No completions recorded yet").
Backfill script shipped in PR #67 (`scripts/backfill-revenue-stats.mjs`).
Ops runs it on demand with `GOOGLE_APPLICATION_CREDENTIALS` set; it
folds every completed order through `bumpRevenueFields` and overwrites
`meta/revenueStats`. Dry-run and confirmation flags included.

### Backdate "Log sale" / completed order timestamps (resolved)
Shipped in PR #68 (`backdate-log-sale`). Sale Messenger now has an
optional `Completed at` datetime field (max: now, min: 30 days back).
When set, the value rides through the `sendTireSaleSms` payload and
`completeOrder` uses it to stamp `completedMs` and `completedAt`; the
30-day lookback is enforced server-side with an `invalid-argument`
HttpsError. `completedAtSource: 'backdated'` is written on meaningful
backdates so analytics can distinguish real-time vs. backfilled
completions later. Seven validation cases covered in
`functions/orders.backdate.test.mjs`.

