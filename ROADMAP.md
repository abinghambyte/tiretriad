# Skedaddle Portal Roadmap

Unimplemented work that has come up in build sessions. Each item has enough
context to pick up cold. Move to a PR + delete the entry when shipped.

## Foundational blockers

These gate multiple items below. None are on deck yet.

### Customer-facing auth
The portal today is crew-only. `skedaddleinc.com` redirects here; there is no
separate marketing site. A customer-facing, lightweight auth path is needed
before VIP concierge, order-self-serve, or any authenticated customer surface
can ship. Likely shape: signed short-lived links (`/vip/:token`) generated
from CRM accounts, no password flow.

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

### VIP concierge surface
Gate the Sinch Chat widget behind a CRM account flag
(`account.vipTier === 'platinum'`). VIP accounts see a premium-branded
chat bubble with different copy and priority routing. Needs
customer-facing auth (see Foundational blockers) before it can land.

Design skeleton:
- Add `vipTier` field to `crmAccounts` (enum: `none` | `standard` |
  `platinum`).
- New route `/vip/:token` where token is signed from the account id.
- Signed-identity Sinch Chat (use `SINCH_CHAT_CLIENT_SECRET` which is
  already in Secret Manager) so the conversation binds to the customer's
  stable uuid across sessions.
- Different `brandText` (`VIP concierge`), different initial-screen copy,
  possibly a different queue in Sinch so VIP messages jump the line.

### Sinch Chat: surface new lead fields in Leads UI
`createSinchChatLead` writes `contactName`, `phone`, `email`, `inquiry`,
`pageUrl`, `referrer`, `sinchConversationId` into the Firestore doc but
the Leads table only renders the original `businessName`, `source`,
`segment`, `fleetSize`, `urgency`, follow-up columns. Once the widget is
live and real leads start coming in, add:
- Inquiry preview column (truncate to 80 chars, full text on hover).
- Detail drawer that shows all fields + a one-click
  `Open Sinch conversation` button that opens the Sinch inbox to the
  `sinchConversationId`.
- Source badge styling (`sinch_chat` gets its own pill color so it's
  visually distinct from walk-in / phone / referral).

### Description-search format mismatch
Searching the Tires catalog for values like `X2L` or a full pasted
description does not always match. The haystack normalizer handles some
size formats (inch vs. metric) but not all. Queued fix: expand
`src/utils/tireSearchHaystack.js` to normalize load-range suffixes
(`LT225/75R16` vs `225/75R16 LT`), speed-rating letters, and the
`/BSW`-style trailing codes.

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

### `/dispatch` placeholder vs. external Workforce app
`/dispatch` currently renders a stub (`DispatchRedirect`) that reads
"Task Dispatcher is being extracted to a standalone application. This
route will reconnect when the external deployment is live." The external
app URL in `src/constants/externalUrls.ts` points at
`workforce-abinghambyte.vercel.app`. Decide one of:
- Finish the handoff: make `/dispatch` redirect to `WORKFORCE_URL`.
- Kill the route: remove `/dispatch` + the stub component + the
  constant if the external app is abandoned.
- Rebuild in-portal: the old `src/pages/TaskDispatcher.jsx` was deleted
  as dead code; a fresh in-portal version would need design.

Today it is a permanent "coming back soon" sign, which is worse than
either decision.

### "DJ streak" and "DJ dispatch" copy decision
Prior commit `7834966` renamed first names to role nouns in system copy
("Kyle to Sourcer, DJ to Field crew"). Two visible references still use
"DJ":
- `src/pages/AnalyticsPage.jsx` - "DJ streak (assigned orders)" metric
  card.
- `src/pages/CrmPage.jsx` - "DJ Dispatch" CRM tab name and the
  "DJ dispatch is for Field crew and Overwatch" gate message on the
  mobile view.

Pick one:
- Keep as product names with personality (DJ is a named streak, DJ
  Dispatch is a branded tab). Document the exception.
- Rename to role-neutral: "Field streak" / "Field Dispatch".

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

### Analytics MTD / WTD revenue tiles (resolved + backfill optional)
Root-caused: the one existing completed order (April 12) pre-dated
commit `a8dbec2` (April 13) which wired `runCompletionTransaction` to
update `meta/revenueStats`. The doc is legitimately empty until the
next completion fires. The UI now distinguishes "doc alive, this
period is zero" (shows `$0.00` with clarifying hint) from "doc never
populated" (shows em-dash with "No completions recorded yet").
Optional follow-up: write a one-off backfill script that reads the
small `orders` collection (`status == 'completed'`) and runs
`bumpRevenueFields` for each one against a freshly-initialized
revenueStats doc. Worth ~30 minutes if the historical line-item
matters for the leaderboard / YTD tiles once more data accumulates.

### Backdate "Log sale" / completed order timestamps
Today `Log sale` stamps `completedAt` as `serverTimestamp()` with no
way to record a sale that happened earlier. A sale logged three days
late still counts as today's revenue in analytics. Add an optional
date-time field (default now, max: now, min: 30 days back) to the
Log Sale / Sale Messenger modal; when set, pass it through the
completion transaction instead of `serverTimestamp()`.

Impact: the `meta/revenueStats` rollup already buckets by
`completedMs`, so this just requires letting a callable override that
timestamp. Audit-wise, also record `completedAtSource: 'backdated'`
on the order doc so analytics can distinguish real-time vs.
backfilled completions if that matters later.

### `crmLeads` new fields not yet surfaced in UI
(Already called out under "Sinch Chat: surface new lead fields in
Leads UI" above. Included here so the audit checklist is complete.)
