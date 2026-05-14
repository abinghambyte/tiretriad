# Tire Triad Rebrand (v1) - Design

**Status:** approved 2026-05-03

## Problem

The portal is currently branded as Skedaddle Inc at `www.skedaddleinc.com`. Per `docs/business/2026-05-02-rebrand-and-gtm-strategy.md`, the operation is restructuring into a dual-brand:

- **Front Range Rubber LLC** - legal entity, commercial-facing, parent of all paperwork (invoices, W9s, paychecks)
- **Tire Triad** - consumer-facing DBA, FB Marketplace seller name, the brand off-roaders and contractors see

The portal is internal tooling. Today only the crew (Alex, DJ, Kyle) signs in. No customers, no fleet partners. Per the brainstorm decision: **the portal brands as Tire Triad** because that's the brand the crew lives inside daily.

This spec covers the code + infrastructure work to retire Skedaddle Inc from the portal's identity and migrate to Tire Triad.

## Brand identity map

| Surface | Brand | Notes |
|---|---|---|
| Internal portal UI chrome (header, title, footer, sign-in, settings, favicon) | Tire Triad | |
| Portal domain | `app.tiretriad.com` | Conventional separation between consumer apex and product app |
| Crew invite emails (subject + body) | Tire Triad | Crew signs into Tire Triad-branded portal |
| Email sending envelope domain | `info.tiretriad.com` | Verified in Resend |
| AI persona system prompts (`salesAdvisor`, `listingCoach`, etc.) | brand-neutral | "a Northern Colorado tire reseller" — never names the operator |
| AI output context (which brand voice to draft in) | request-driven | Tagged on each request via `brand: 'tire-triad' \| 'frr' \| 'all'` |
| Commercial outreach (cold call / fleet quote) | Front Range Rubber LLC | Different audience, different voice |
| Commercial landing page | `frontrangerubber.com` | Existing `marketing/frontrangerubber/` deploys here |
| Legal entity on invoices / W9 / paychecks | Front Range Rubber LLC | |
| FB Marketplace seller name | Tire Triad | |
| Apex `tiretriad.com` | redirect to FB Marketplace seller URL (v1) | Consumer landing page is a separate, deferred spec |
| Legacy `www.skedaddleinc.com` apex | 301 redirect to `app.tiretriad.com` | Preserves crew bookmarks during cutover |
| Legacy `info.skedaddleinc.com` | leave live ~30 days as fallback | Decommission after `info.tiretriad.com` reputation is established |

## Architecture

### Central brand config

One new file on each side reads as the source of truth:

`src/config/brand.js`:

```js
export const BRAND = {
  portal: 'Tire Triad',
  legalEntity: 'Front Range Rubber LLC',
  apex: 'tiretriad.com',
  portalDomain: 'app.tiretriad.com',
  emailDomain: 'info.tiretriad.com',
  supportEmail: 'info@tiretriad.com',
  inviteUrlBase: 'https://app.tiretriad.com/i',
  legacyApex: 'skedaddleinc.com',
}
```

Mirror at `functions/brand.js` (CommonJS) for server-side consumption.

Every "Tire Triad" / "Front Range Rubber LLC" / domain reference in the codebase reads from this module. Replaces the hardcoded `INVITE_SITE` constant in `src/components/people/InviteUrlToolkit.jsx` (currently `https://www.skedaddleinc.com`) and the hardcoded URL builder in `functions/peopleCallables.js` (currently `https://www.skedaddleinc.com/i/${token}`).

Rationale: future rebrands (if ever) are a one-file change. Brand-neutral persona strings stay clean. New surfaces written after this can reach for `BRAND.portal` without ambiguity.

### AI persona structure

System prompts drop the brand name and become role definitions:

```
// salesAdvisor.js (before)
You are a sales coach and pricing advisor for Skedaddle Inc, a tire reseller in Loveland, Colorado.

// salesAdvisor.js (after)
You are a sales coach and pricing advisor for a Northern Colorado tire reseller.
```

```
// listingCoach.js (before)
You are Skedaddle's Listing Coach. Skedaddle resells brand-new tires sourced from a Michelin eFleet program.

// listingCoach.js (after)
You are a tire-listing coach for a small Northern Colorado tire reseller. Your operator sources new Michelin and BFGoodrich product through wholesale channels (the source is private; never mention it in any draft listing or reasoning the user might paste publicly).
```

Brand context (which voice to write in) flows through request payloads, not the persona. The listing coach already has `audience: 'consumer' | 'commercial' | 'all'` tagging on style rules; add `brand: 'tire-triad' | 'frr' | 'all'` as a parallel dimension so the model knows whether a draft is for the Tire Triad seller persona or the Front Range Rubber commercial vendor persona.

The listing coach few-shot anchor (the 2026-05-01 LT285/70R17 KO2 walkthrough baked into `functions/__fixtures__/listingCoachFewShot.txt`) gets a light re-write to drop "Skedaddle" references; the listing draft inside the anchor already signs as Tire Triad in spirit.

### Email subjects

Already updated in `commit b0a3b91` to clear, brand-identified subject lines. The spec preserves the same shape but flips the brand name:

```
Skedaddle sign-in code  →  Tire Triad sign-in code
Skedaddle portal invite →  Tire Triad portal invite
```

Concretely: `'${code} is your Tire Triad sign-in code'` and `'${firstName}, your Tire Triad portal invite'`.

### Domain migration (Phase 3)

Touchpoints in order:

1. **DNS** (Cloudflare for `tiretriad.com`): A/AAAA or CNAME for `app.tiretriad.com` pointing at the host
2. **Firebase Auth authorized domains** (Firebase Console): add `app.tiretriad.com`, leave `skedaddleinc.com` live during cutover
3. **Firebase Hosting** (if used): add `app.tiretriad.com` as a connected domain to the Hosting site
4. **Vercel** (if used): add the domain to the project, set as primary
5. **Code references**: `INVITE_SITE` constant + invite URL builder in `peopleCallables.js` migrated to use `BRAND.inviteUrlBase`
6. **OAuth providers** (if any external — Google / Slack OAuth callback URLs): update authorized redirect URIs to include the new domain
7. **Sentry** (release tracking): no change required — Sentry tracks errors by app, not domain
8. **Cloudflare Page Rules** on the old domain: 301 from `*.skedaddleinc.com/*` to `https://app.tiretriad.com/$1` (preserves bookmarks for ~30 days, then re-evaluate)
9. **README / docs**: update any URL references the next engineer would hit

### Email sending migration (Phase 4)

1. Resend dashboard: add `info.tiretriad.com` as a sending domain
2. Resend gives DNS records (SPF, DKIM, return-path CNAME)
3. Add records to Cloudflare DNS for `tiretriad.com`
4. Wait for Resend verification (1-15 min)
5. Update Firebase secrets:
   - `firebase functions:secrets:set RESEND_FROM_EMAIL` → `invite@info.tiretriad.com`
   - (optional) `RESEND_REPLY_TO_EMAIL` to a Tire Triad inbox via Cloudflare Email Routing on `tiretriad.com`
6. Auto-redeploy the four invite-handling functions
7. Send 5-10 test invites to personal addresses, mark "Not spam" in each, repeat over 2-3 days to season the domain reputation
8. After ~30 days of successful sending: remove `info.skedaddleinc.com` from Resend, drop SPF/DKIM records from Cloudflare for `skedaddleinc.com`

## Phases

Five phases, each shippable as an independent commit / PR / verifiable change. The order minimizes risk: phases 1-2 ship visible value without infrastructure work; phases 3-4 carry the migration risk; phase 5 is cleanup.

### Phase 1: Portal chrome (visual rebrand)

Scope: every string + visual element the crew sees in the portal that says "Skedaddle". Pure UI work, no infrastructure.

Files touched (approximate):
- `index.html` (title, OG, meta)
- `src/components/layout/PortalTopBar.jsx` (header, logo)
- `src/components/layout/DesktopTopNav.jsx`, `MobileBottomNav.jsx` (footer text)
- `src/pages/InvitePage.jsx`, `WelcomePage.jsx`, login screens
- `src/pages/HandshakePage.jsx` (first-login welcome)
- `public/manifest.json` (PWA name)
- `public/favicon.ico` (replace asset)
- README.md (project name + tagline)
- `vite.config.js` (if any branded constants)

Acceptance: crew signs in, sees Tire Triad in the chrome, no broken images, no leftover "Skedaddle" strings except in the few audit-log / docs places explicitly out-of-scope.

### Phase 2: AI personas + email subjects

Scope: AI system prompts go brand-neutral. Email subjects flip to Tire Triad. No infrastructure.

Files touched:
- `functions/salesAdvisor.js` (persona)
- `functions/listingCoach.js` (persona)
- `functions/__fixtures__/listingCoachFewShot.txt` (few-shot anchor)
- `functions/advisorNarrate.js` (already brand-neutral; verify)
- `functions/inviteFlow.js` (email subjects)
- Style rules data: existing rows in `meta/listingCoachStyleGuide` referencing Skedaddle (if any) — sweep manually via admin page
- Schema: add `brand` dimension to style rules (`audience` already exists)

Acceptance: AI outputs no longer name "Skedaddle" anywhere; the listing coach few-shot anchor still produces equivalent-quality drafts.

### Phase 3: Portal domain migration

Scope: stand up `app.tiretriad.com`, migrate auth and routing, redirect the old domain.

Files touched:
- `src/config/brand.js` + `functions/brand.js` (new; consumed in subsequent phases)
- `src/components/people/InviteUrlToolkit.jsx` (`INVITE_SITE` const → reads from `BRAND`)
- `functions/peopleCallables.js` (hardcoded URL → reads from `BRAND`)
- Cloudflare DNS for `tiretriad.com`
- Firebase Auth console (authorized domains)
- Firebase Hosting / Vercel (project domain config)
- Cloudflare Page Rules on `skedaddleinc.com` (301 redirect to `app.tiretriad.com/$1`)

Acceptance: `https://app.tiretriad.com` serves the portal; invites generated point at `https://app.tiretriad.com/i/${token}`; old bookmarks 301 to the new home.

### Phase 4: Email sending domain migration

Scope: stand up `info.tiretriad.com` in Resend, migrate `RESEND_FROM_EMAIL`, warm the new sending reputation.

Files touched:
- Resend dashboard (add domain, verify)
- Cloudflare DNS for `tiretriad.com` (Resend's SPF/DKIM/return-path records)
- Firebase secrets (`RESEND_FROM_EMAIL`, optional `RESEND_REPLY_TO_EMAIL`)
- No code changes — secrets are already read from env

Acceptance: invite emails arrive from `invite@info.tiretriad.com`; the LastDelivery banner shows green with the new sender; ~5 successful test sends to seed reputation.

### Phase 5: Decommission

Scope: tear down legacy infrastructure after a soft 30-day overlap.

Files touched:
- Resend dashboard (remove `info.skedaddleinc.com`)
- Cloudflare DNS (drop Resend's SPF / DKIM records from `skedaddleinc.com`)
- Cloudflare Page Rules on `skedaddleinc.com` (keep the 301 indefinitely, or drop if desired)
- `BRAND.legacyApex` constant — leave in for ~90 days then remove

Acceptance: nothing in production references the Skedaddle domain or Skedaddle subdomain for outbound activity; old bookmarks either still redirect or 404 cleanly.

## Testing plan

Per phase:

- **Phase 1**: visual diff vs. before; manual smoke test of every page the crew touches; favicon renders correctly on iOS/Android home screens
- **Phase 2**: snapshot tests of AI persona outputs against a known fixture (verify no "Skedaddle" string); send one of each email type to a test address and confirm subjects
- **Phase 3**: sign in via `app.tiretriad.com`, accept an invite via the new URL, verify OAuth callbacks succeed, verify old `skedaddleinc.com` URL 301s
- **Phase 4**: send 5 test invites to personal inboxes (mix of Gmail, Outlook, iCloud), confirm inbox-not-spam delivery within 24h after warming, verify Reply-To routes correctly
- **Phase 5**: dig +short MX/SPF/TXT on `info.skedaddleinc.com` returns nothing; old URL behavior unchanged or removed per choice

## Risks

| Risk | Mitigation |
|---|---|
| Email reputation reset (Phase 4) | Warming sequence: 5-10 personal-inbox sends with "Not spam" before any real customer mail. ~2 weeks of normal sending establishes the new domain. |
| OAuth callback breaks during domain cutover (Phase 3) | Add `app.tiretriad.com` to authorized domains BEFORE removing `skedaddleinc.com`. Test sign-in on both during overlap window. |
| Crew bookmarks broken after cutover | Cloudflare Page Rule 301s old URLs to new. Keep redirect live for at least 30 days. |
| AI persona output regression (Phase 2) | Compare snapshot outputs against a fixture before/after. The few-shot anchor is the highest-risk change — keep the technical content identical, only the brand name flips. |
| Hardcoded "Skedaddle" strings missed (Phase 1) | `grep -ri "skedaddle" src/ public/ functions/` before declaring done. Treat any output (excluding `docs/`, `marketing/`, audit-log historical records) as unresolved. |
| Cost of `tiretriad.com` domain rebrand if Tire Triad doesn't survive | $11/year domain cost is cheap. Reputation reset is the bigger cost; mitigated by phasing email last after portal is proven. |

## Out of scope

- **Tire Triad consumer landing page** at `tiretriad.com` apex (v1 just redirects to FB Marketplace seller URL; a real landing is a separate spec when consumer traffic justifies it)
- **Visual identity design** — logo, wordmark, color palette, brand book. v1 uses simple text-only wordmark in the chrome. Hire-a-designer is a separate exercise.
- **Historical Skedaddle references in `docs/superpowers/specs/`, `docs/superpowers/plans/`, `docs/superpowers/audits/`, `docs/handoffs/`, ROADMAP.md** — these are historical artifacts and should remain accurate to the period they cover. Newly written docs after this spec use the new brand names.
- **Audit log, order records, payout entries** that already contain "Skedaddle Inc" string — immutable historical data, not migrated
- **Slack workspace rename** — out of code scope; user can rename the workspace independently
- **Decommission of `skedaddleinc.com` domain registration** itself — operational decision, not in this spec
- **Marketing for the consumer side beyond FB Marketplace** — Tire Triad's primary surface stays FB until consumer traffic justifies an apex landing
- **B2B customer portal** — fleet partners do not log into the portal today; if/when they do, that's a separate spec with its own brand decision (probably FRR-branded white-label)

## File counts (rough estimate for plan sizing)

- Phase 1: ~15-25 client files (chrome strings + assets)
- Phase 2: ~6 function files (personas + email subjects + few-shot fixture)
- Phase 3: ~5 client + server files (config + URL builders) plus 6 infrastructure touchpoints (Cloudflare DNS, Firebase Auth, Hosting / Vercel, Page Rules, README)
- Phase 4: 0 code files (Resend dashboard + Cloudflare DNS + secrets)
- Phase 5: 0 code files (decommission via dashboard)

Total: ~25-35 code files touched, plus dashboards/infra. Roughly 4-8 hours of implementation across the five phases, spread over 2-3 days to absorb domain DNS propagation + email warming.
