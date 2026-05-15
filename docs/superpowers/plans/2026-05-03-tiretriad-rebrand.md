# Tire Triad Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire Skedaddle Inc as the portal's identity. Migrate portal chrome, AI persona prompts, email subjects, portal domain, and email sending domain to Tire Triad. Front Range Rubber LLC stays as the legal entity referenced on commercial-facing surfaces.

**Architecture:** Single-source brand config (`src/config/brand.js` + `functions/brand.js`) replaces hardcoded "Skedaddle" strings and domain URLs. AI personas go brand-neutral; brand context flows in from request payloads. Phased rollout: chrome → personas + email subjects → portal domain → email sending domain → decommission. Each phase ships independently with verifiable acceptance criteria.

**Tech Stack:** React 19 + Vite + Tailwind v4 + Vitest (client), Firebase Functions v2 + Node 22 + Vitest (server), Cloudflare DNS, Firebase Auth, Resend (email), Vercel hosting.

**Spec:** `docs/superpowers/specs/2026-05-03-tiretriad-rebrand-design.md`
**Worktree:** `.claude/worktrees/tiretriad-rebrand` (branch `tiretriad-rebrand`)

**Style guardrails:**
- NO em dashes anywhere (regular hyphens)
- NO AI / Co-Authored-By trailers in commits
- HEREDOC commit messages
- CommonJS in `functions/`, ESM in `src/` and `scripts/`
- Vitest plain `expect`/`fireEvent`, no jest-dom matchers

**Crew-task vs code-task convention:** every code task is prefixed `[CODE]` (a subagent or you-with-keyboard can execute it). Every infrastructure / dashboard / DNS / paperwork task is prefixed `[CREW]` and requires your hands. Code tasks gate on `[CREW]` tasks where stated.

---

## File map

### New

| File | Responsibility |
|---|---|
| `src/config/brand.js` | Client-side brand constants (portal name, legal entity, domains, support email, invite URL base) |
| `src/config/brand.test.js` | Sanity tests on the constants |
| `functions/brand.js` | Server-side mirror of `src/config/brand.js`, CommonJS |
| `functions/brand.test.mjs` | Server-side sanity tests |

### Modified (Phase 1: portal chrome)

| File | Change |
|---|---|
| `index.html` | `<title>`, `<meta name="description">`, OG / Twitter tags, theme-color |
| `src/main.jsx` | Any branded `console.log` / boot message |
| `public/manifest.json` | PWA name + short_name |
| `src/components/layout/PortalTopBar.jsx` | Header logo + title text |
| `src/components/layout/PortalChrome.jsx` | Layout-level brand text |
| `src/components/layout/MobileBottomNav.jsx` | Branded text if any |
| `src/components/ui/BrandBolt.jsx` | The wordmark / icon component if it embeds "Skedaddle" |
| `src/pages/InvitePage.jsx` | Sign-in / invite landing brand text |
| `src/pages/HandshakePage.jsx` | First-login welcome text |
| `src/pages/GrowthLabPage.jsx` | Any branded copy |
| `src/pages/CrmPage.jsx` | Any branded headings |
| `src/pages/MechanicIntakePage.jsx` | Any branded headings |
| `src/components/chat/SinchChatMount.jsx` | Branded copy in chat shell |
| `src/components/crm/CrmAccountDetailPanel.jsx` | Branded copy |
| `src/components/orders/OrdersList.jsx` | Branded copy in orders list (SMS preview etc) |
| `src/components/tires/TiresDashboard.jsx` | Branded copy |
| `src/components/tires/QuoteCalculator.jsx` | Branded copy in quote modal |
| `src/components/tires/MarginFilters.jsx` | Branded copy |
| `src/components/dashboard/NextToPostSurface.jsx` | Branded copy |
| `src/firebase/config.js` | Project name / branded comments |
| `src/utils/marginCalc.js` | Branded comments |
| `src/utils/tireSearchHaystack.js` | Branded comments |
| `src/utils/saleMessenger.js` | Branded SMS templates |
| `src/utils/playOrderCompleteSound.js` | Branded copy |
| `src/constants/tireCategory.js` | Branded comments |
| `package.json` | `name` field |
| `README.md` | Project name + tagline |
| `public/favicon.ico` | Replace asset (out-of-band, see CREW task) |

### Modified (Phase 2: AI personas + email subjects)

| File | Change |
|---|---|
| `functions/salesAdvisor.js` | TIRES_PERSONA: drop "Skedaddle Inc" |
| `functions/listingCoach.js` | PERSONA: drop "Skedaddle's" |
| `functions/__fixtures__/listingCoachFewShot.txt` | Replace "Skedaddle" references |
| `functions/inviteFlow.js` | Email subjects "Skedaddle" → "Tire Triad" |
| `functions/listingAdvisorGenerator.js` | Branded copy if any |
| `functions/orders.js` | Branded SMS / Slack message templates |

### Modified (Phase 3: portal domain)

| File | Change |
|---|---|
| `src/components/people/InviteUrlToolkit.jsx` | `INVITE_SITE` → read from `BRAND.inviteUrlBase` |
| `functions/peopleCallables.js` | Hardcoded `https://www.skedaddleinc.com/i/${token}` → use `BRAND.inviteUrlBase` |
| `functions/inviteFlow.js` | Any other hardcoded domain refs |
| Cloudflare DNS for `tiretriad.com` | Add `app.` CNAME / A record (CREW) |
| Firebase Auth authorized domains | Add `app.tiretriad.com` (CREW) |
| Vercel project | Add domain, set primary (CREW) |
| Cloudflare Page Rules on `skedaddleinc.com` | 301 to `app.tiretriad.com/$1` (CREW) |

### Modified (Phase 4: email sending)

| File | Change |
|---|---|
| Resend dashboard | Add `info.tiretriad.com`, verify (CREW) |
| Cloudflare DNS for `tiretriad.com` | SPF + DKIM + return-path CNAME (CREW) |
| Firebase secrets | `RESEND_FROM_EMAIL` → `invite@info.tiretriad.com` (CREW) |

### Modified (Phase 5: decommission)

| File | Change |
|---|---|
| Resend dashboard | Remove `info.skedaddleinc.com` (CREW, after 30 days) |
| Cloudflare DNS for `skedaddleinc.com` | Drop Resend SPF / DKIM records (CREW) |

---

## Phase 1: Portal chrome rebrand

Pure UI + string work. No infrastructure. Ships independently.

### Task 1.1: [CODE] Brand config module

**Files:**
- Create: `src/config/brand.js`
- Create: `src/config/brand.test.js`
- Create: `functions/brand.js`
- Create: `functions/brand.test.mjs`

- [ ] **Step 1: Write the failing client tests**

```js
// src/config/brand.test.js
import { describe, expect, it } from 'vitest'
import { BRAND } from './brand.js'

describe('BRAND config', () => {
  it('exposes portal + legal entity names', () => {
    expect(BRAND.portal).toBe('Tire Triad')
    expect(BRAND.legalEntity).toBe('Front Range Rubber LLC')
  })

  it('exposes the canonical domains', () => {
    expect(BRAND.apex).toBe('tiretriad.com')
    expect(BRAND.portalDomain).toBe('app.tiretriad.com')
    expect(BRAND.emailDomain).toBe('info.tiretriad.com')
    expect(BRAND.supportEmail).toBe('info@tiretriad.com')
  })

  it('builds the invite URL base', () => {
    expect(BRAND.inviteUrlBase).toBe('https://app.tiretriad.com/i')
  })

  it('preserves the legacy apex for the redirect window', () => {
    expect(BRAND.legacyApex).toBe('skedaddleinc.com')
  })
})
```

Run: `cd .claude/worktrees/tiretriad-rebrand && npx vitest run src/config/brand.test.js`
Expected: FAIL ("Cannot find module './brand.js'")

- [ ] **Step 2: Write client `brand.js`**

```js
// src/config/brand.js

/**
 * Source of truth for portal brand identity + domain references.
 *
 * Every "Tire Triad" / "Front Range Rubber LLC" / portal domain
 * reference in client code reads from this module so a future
 * rebrand is a one-file change. Mirror server-side at functions/brand.js.
 *
 * Notes on the dual-brand structure (see
 * docs/business/2026-05-02-rebrand-and-gtm-strategy.md):
 *   portal      = Tire Triad      (consumer-facing DBA, portal chrome)
 *   legalEntity = Front Range Rubber LLC (commercial, paperwork)
 */
export const BRAND = Object.freeze({
  portal: 'Tire Triad',
  legalEntity: 'Front Range Rubber LLC',
  apex: 'tiretriad.com',
  portalDomain: 'app.tiretriad.com',
  emailDomain: 'info.tiretriad.com',
  supportEmail: 'info@tiretriad.com',
  inviteUrlBase: 'https://app.tiretriad.com/i',
  legacyApex: 'skedaddleinc.com',
})
```

- [ ] **Step 3: Verify client tests pass**

Run: `npx vitest run src/config/brand.test.js`
Expected: 5/5 passing

- [ ] **Step 4: Write server tests**

```js
// functions/brand.test.mjs
import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { BRAND } = require('./brand.js')

describe('BRAND config (server)', () => {
  it('mirrors client constants', () => {
    expect(BRAND.portal).toBe('Tire Triad')
    expect(BRAND.legalEntity).toBe('Front Range Rubber LLC')
    expect(BRAND.apex).toBe('tiretriad.com')
    expect(BRAND.portalDomain).toBe('app.tiretriad.com')
    expect(BRAND.emailDomain).toBe('info.tiretriad.com')
    expect(BRAND.supportEmail).toBe('info@tiretriad.com')
    expect(BRAND.inviteUrlBase).toBe('https://app.tiretriad.com/i')
    expect(BRAND.legacyApex).toBe('skedaddleinc.com')
  })
})
```

Run: `npx vitest run functions/brand.test.mjs`
Expected: FAIL

- [ ] **Step 5: Write server `brand.js`**

```js
// functions/brand.js

/**
 * Server-side mirror of src/config/brand.js. Keep in sync. CommonJS so
 * existing Cloud Functions can require() it without an ESM transform.
 */
const BRAND = Object.freeze({
  portal: 'Tire Triad',
  legalEntity: 'Front Range Rubber LLC',
  apex: 'tiretriad.com',
  portalDomain: 'app.tiretriad.com',
  emailDomain: 'info.tiretriad.com',
  supportEmail: 'info@tiretriad.com',
  inviteUrlBase: 'https://app.tiretriad.com/i',
  legacyApex: 'skedaddleinc.com',
})

module.exports = { BRAND }
```

- [ ] **Step 6: Verify server tests pass**

Run: `npx vitest run functions/brand.test.mjs`
Expected: 1/1 passing

- [ ] **Step 7: Commit**

```bash
cd .claude/worktrees/tiretriad-rebrand
git add src/config/brand.js src/config/brand.test.js functions/brand.js functions/brand.test.mjs
git commit -m "$(cat <<'EOF'
feat(brand): central brand config (Tire Triad + Front Range Rubber)

src/config/brand.js + functions/brand.js are now the source of truth
for portal name, legal entity, and the domain triplet (apex / portal
subdomain / email subdomain). Replaces hardcoded "Skedaddle" strings
and the duplicated INVITE_SITE / invite URL builder. Future rebrands
become a one-file change.

Sets up Phase 1 consumers. Subsequent commits replace inline strings
across the chrome with BRAND.portal references where the value is
visible at compile time (titles, headers, manifest), and where a
URL needs to be built (invite URL, support email mailto links).
EOF
)"
```

### Task 1.2: [CODE] Replace "Skedaddle" in `index.html` + manifest + favicon meta

**Files:**
- Modify: `index.html`
- Modify: `public/manifest.json`
- Modify: `package.json`

- [ ] **Step 1: Read current state**

Read `index.html`. Look for `<title>`, `<meta name="description">`, OG / Twitter tags. Identify every "Skedaddle" occurrence.

- [ ] **Step 2: Replace strings in `index.html`**

Replace every literal "Skedaddle" with "Tire Triad". For occurrences referencing the legal entity in copyright / footer / privacy mentions, use "Front Range Rubber LLC" instead. The title tag should read:

```html
<title>Tire Triad Portal</title>
```

The meta description should read:

```html
<meta name="description" content="Tire Triad operator portal: inventory, orders, listings, and crew tools." />
```

OG / Twitter card metadata should match.

- [ ] **Step 3: Update `public/manifest.json`**

```json
{
  "name": "Tire Triad Portal",
  "short_name": "Tire Triad"
}
```

(Preserve the rest of the manifest unchanged: icons, theme_color, background_color, start_url, display.)

- [ ] **Step 4: Update `package.json`**

Change `"name": "skedaddle-portal"` to `"name": "tire-triad-portal"`. Leave version, scripts, deps untouched.

- [ ] **Step 5: Run build to verify no breakage**

```bash
npm run build
```
Expected: clean build, dist/ produced.

- [ ] **Step 6: Commit**

```bash
git add index.html public/manifest.json package.json
git commit -m "$(cat <<'EOF'
chore(rebrand): index.html + manifest + package.json -> Tire Triad

Page title, meta description, OG / Twitter card metadata, PWA name
+ short_name, and the npm project name all read Tire Triad. Legal
entity references (footer copyright, legal-text mentions) read
Front Range Rubber LLC. Pure string changes, no behavior change.
EOF
)"
```

### Task 1.3: [CODE] Sweep `src/components/layout/` chrome strings

**Files:**
- Modify: `src/components/layout/PortalTopBar.jsx`
- Modify: `src/components/layout/PortalChrome.jsx`
- Modify: `src/components/layout/MobileBottomNav.jsx`
- Modify: `src/components/layout/DesktopTopNav.jsx`

- [ ] **Step 1: Read and identify every Skedaddle reference in layout files**

Run: `grep -n "Skedaddle\|skedaddle" src/components/layout/*.jsx`

For each occurrence, classify:
- Display text → "Tire Triad"
- Legal / footer / copyright context → "Front Range Rubber LLC"
- Comment referencing Skedaddle Inc historically → leave (historical accuracy)

- [ ] **Step 2: Update `PortalTopBar.jsx`**

The header logo / wordmark in this file should read "Tire Triad". If it imports `BrandBolt` (the wordmark component) the rebrand happens in 1.4 below; for now just replace inline strings.

```jsx
// Wherever "Skedaddle" appeared as a literal:
<span className="font-semibold text-zinc-100">Tire Triad</span>
```

- [ ] **Step 3: Update `PortalChrome.jsx` + `MobileBottomNav.jsx` + `DesktopTopNav.jsx`**

Same pattern: literal "Skedaddle" in display text → "Tire Triad". Footer / copyright → "Front Range Rubber LLC".

- [ ] **Step 4: Run client tests**

```bash
npx vitest run src/components/layout/
```
Expected: green. If any test asserts the literal "Skedaddle" string, update the assertion to "Tire Triad".

- [ ] **Step 5: Commit**

```bash
git add -u src/components/layout/
git commit -m "$(cat <<'EOF'
chore(rebrand): layout chrome strings -> Tire Triad

PortalTopBar, PortalChrome, MobileBottomNav, DesktopTopNav: every
visible Skedaddle string flipped to Tire Triad. Legal / footer
contexts read Front Range Rubber LLC. Comments referencing the
historical Skedaddle Inc legal entity left as-is.
EOF
)"
```

### Task 1.4: [CODE] Update `BrandBolt` wordmark component

**Files:**
- Modify: `src/components/ui/BrandBolt.jsx`
- Modify: `src/components/ui/BrandBolt.test.jsx`

- [ ] **Step 1: Read current `BrandBolt.jsx`**

Identify whether it renders text or an SVG icon (or both). If text, swap to "Tire Triad". If SVG and the SVG embeds "Skedaddle" as a path-as-text or similar, swap.

- [ ] **Step 2: Update display string + any aria-label**

```jsx
// example pattern
<span className="font-bold tracking-tight">Tire Triad</span>
```

aria-label: `aria-label="Tire Triad"`.

- [ ] **Step 3: Update `BrandBolt.test.jsx`**

Any assertion against literal "Skedaddle" string flips to "Tire Triad". `expect(container.textContent).toContain('Tire Triad')`.

- [ ] **Step 4: Run + commit**

```bash
npx vitest run src/components/ui/BrandBolt.test.jsx
git add src/components/ui/BrandBolt.jsx src/components/ui/BrandBolt.test.jsx
git commit -m "chore(rebrand): BrandBolt wordmark -> Tire Triad"
```

### Task 1.5: [CODE] Sweep page-level chrome strings

**Files:**
- Modify: `src/pages/InvitePage.jsx`
- Modify: `src/pages/HandshakePage.jsx`
- Modify: `src/pages/CrmPage.jsx`
- Modify: `src/pages/MechanicIntakePage.jsx`
- Modify: `src/pages/GrowthLabPage.jsx`
- Modify: `src/main.jsx`

- [ ] **Step 1: Identify all Skedaddle references across pages**

```bash
grep -n "Skedaddle\|skedaddle" src/pages/*.jsx src/main.jsx
```

For each:
- Display text → "Tire Triad"
- Legal / paperwork → "Front Range Rubber LLC"
- Comments → leave

- [ ] **Step 2: Replace strings one file at a time**

Read each file, edit each occurrence according to the rule above. The most user-visible:
- `InvitePage.jsx`: Sign-in / invite-accept hero copy → "Welcome to Tire Triad" etc.
- `HandshakePage.jsx`: First-login welcome → "Tire Triad" branding
- Other pages: heading text where Skedaddle was used as section title.

- [ ] **Step 3: Run vitest for pages**

```bash
npx vitest run src/pages/
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/InvitePage.jsx src/pages/HandshakePage.jsx src/pages/CrmPage.jsx src/pages/MechanicIntakePage.jsx src/pages/GrowthLabPage.jsx src/main.jsx
git commit -m "$(cat <<'EOF'
chore(rebrand): page-level chrome strings -> Tire Triad

InvitePage, HandshakePage, CrmPage, MechanicIntakePage,
GrowthLabPage, main.jsx: visible Skedaddle strings flipped.
Sign-in screen, welcome handshake, and section headings now
read Tire Triad. Legal context references Front Range Rubber LLC.
EOF
)"
```

### Task 1.6: [CODE] Sweep remaining feature-level chrome strings

**Files:**
- Modify: `src/components/tires/TiresDashboard.jsx`
- Modify: `src/components/tires/QuoteCalculator.jsx`
- Modify: `src/components/tires/MarginFilters.jsx`
- Modify: `src/components/orders/OrdersList.jsx`
- Modify: `src/components/crm/CrmAccountDetailPanel.jsx`
- Modify: `src/components/dashboard/NextToPostSurface.jsx`
- Modify: `src/components/chat/SinchChatMount.jsx`

- [ ] **Step 1: Identify all references**

```bash
grep -n "Skedaddle\|skedaddle" src/components/tires/TiresDashboard.jsx src/components/tires/QuoteCalculator.jsx src/components/tires/MarginFilters.jsx src/components/orders/OrdersList.jsx src/components/crm/CrmAccountDetailPanel.jsx src/components/dashboard/NextToPostSurface.jsx src/components/chat/SinchChatMount.jsx
```

- [ ] **Step 2: Replace strings file by file**

Same rule: display text → "Tire Triad"; legal → "Front Range Rubber LLC"; comments left alone.

Special attention to `OrdersList.jsx`: the SMS preview templates ("Hey, this is Alex from Skedaddle...") need updating. The customer-facing brand here should be **Tire Triad** (consumer FB Marketplace channel buyer). Update to "Hey, this is Alex from Tire Triad...".

`NextToPostSurface.jsx` is on the dashboard; the strings there are crew-visible only, flip to "Tire Triad".

- [ ] **Step 3: Run tests + commit**

```bash
npx vitest run src/components/
git add src/components/tires/TiresDashboard.jsx src/components/tires/QuoteCalculator.jsx src/components/tires/MarginFilters.jsx src/components/orders/OrdersList.jsx src/components/crm/CrmAccountDetailPanel.jsx src/components/dashboard/NextToPostSurface.jsx src/components/chat/SinchChatMount.jsx
git commit -m "$(cat <<'EOF'
chore(rebrand): feature-level chrome strings -> Tire Triad

Tires dashboard, quote modal, margin filters, orders list (incl.
SMS preview templates), CRM panel, next-to-post surface, chat
mount: all crew-visible Skedaddle strings flipped to Tire Triad.
Customer-facing SMS templates also flipped since consumer-FB
channel buyers see the Tire Triad brand.
EOF
)"
```

### Task 1.7: [CODE] Sweep utility + constants files

**Files:**
- Modify: `src/utils/marginCalc.js`
- Modify: `src/utils/saleMessenger.js`
- Modify: `src/utils/playOrderCompleteSound.js`
- Modify: `src/utils/tireSearchHaystack.js`
- Modify: `src/constants/tireCategory.js`
- Modify: `src/firebase/config.js`

- [ ] **Step 1: Identify references**

```bash
grep -n "Skedaddle\|skedaddle" src/utils/marginCalc.js src/utils/saleMessenger.js src/utils/playOrderCompleteSound.js src/utils/tireSearchHaystack.js src/constants/tireCategory.js src/firebase/config.js
```

For these files most references are in JSDoc comments documenting the project context. Comments referencing historical Skedaddle should stay (historical accuracy). String literals that flow into runtime output (e.g. `saleMessenger.js` SMS template strings) need to flip to "Tire Triad".

`src/firebase/config.js` is special: the Firebase **project ID** is `skedaddle-inventory` and that is **immutable** — do NOT change it. Only update any user-facing comments / display strings.

- [ ] **Step 2: Update each file**

Read each, apply the rule. Mostly leave alone; the only material changes are likely in `saleMessenger.js` (SMS templates).

- [ ] **Step 3: Run tests + commit**

```bash
npx vitest run src/utils/ src/constants/ src/firebase/
git add src/utils/ src/constants/ src/firebase/
git commit -m "$(cat <<'EOF'
chore(rebrand): utility + constants string sweep -> Tire Triad

Updated user-visible string literals in saleMessenger SMS templates.
JSDoc comments referencing historical Skedaddle Inc context kept
as-is. Firebase project ID 'skedaddle-inventory' is immutable and
unchanged; only comments / display strings touched.
EOF
)"
```

### Task 1.8: [CODE] Update README + tests/visual/setup.ts

**Files:**
- Modify: `README.md`
- Modify: `tests/visual/setup.ts`

- [ ] **Step 1: README**

Change top-line title from "Skedaddle Portal" (or similar) to "Tire Triad Portal". Update any tagline or "what this is" intro. Historical sections referencing the original Skedaddle project name in a context like "originally built as Skedaddle Portal in early 2026, rebranded to Tire Triad on 2026-05-03" are acceptable additions if it helps future maintainers understand the history.

- [ ] **Step 2: tests/visual/setup.ts**

Update any visual-test setup branding (page titles, snapshot expectations against the literal "Skedaddle" string).

- [ ] **Step 3: Commit**

```bash
git add README.md tests/visual/setup.ts
git commit -m "chore(rebrand): README + visual-test setup -> Tire Triad"
```

### Task 1.9: [CREW] Update favicon

**No code task.**

- [ ] **Step 1: Generate or commission a new favicon**

The favicon at `public/favicon.ico` currently displays the Skedaddle mark. Replace with a Tire Triad mark. For v1 a simple text-on-dark-circle ("TT" or "🏁") is fine; commission a real wordmark / icon later.

Easiest path: generate a 32x32 PNG with the letters "TT" in white on a dark background via any quick favicon generator (favicon.io, realfavicongenerator.net). Save as `public/favicon.ico` (replace) AND any associated `public/apple-touch-icon.png` etc.

After replacing, run `npm run build && npm run dev`, open the app in a fresh tab (browsers cache favicons aggressively — use incognito or hard refresh), confirm the new icon shows in the tab.

- [ ] **Step 2: Commit asset**

```bash
git add public/favicon.ico public/apple-touch-icon.png
git commit -m "chore(rebrand): favicon -> Tire Triad placeholder"
```

### Task 1.10: [CODE] Phase 1 verification

- [ ] **Step 1: Grep audit**

```bash
cd .claude/worktrees/tiretriad-rebrand
grep -rn "Skedaddle\|skedaddle" src/ public/ index.html package.json README.md --exclude-dir=node_modules
```

Expected output: only comments referencing historical context, the `firebase-config-skedaddle-inventory` immutable project ID, and `BRAND.legacyApex` (intentional). No display strings should remain.

- [ ] **Step 2: Run full vitest + lint + build**

```bash
npx vitest run src/
npm run lint
npm run build
```

All three: green / 0 errors / clean build.

- [ ] **Step 3: Manual smoke**

```bash
npm run dev
```

Open the app. Verify visible: header reads "Tire Triad", page title in browser tab reads "Tire Triad Portal", sign-in screen reads Tire Triad. Refresh several pages to confirm no stale "Skedaddle" leaks.

- [ ] **Step 4: HOLD for user direction on push**

Do NOT push Phase 1 alone unless you specifically want to ship just the chrome rebrand. Otherwise continue to Phase 2 and ship the full plan at the end.

---

## Phase 2: AI personas + email subjects

Brand-neutral system prompts + Tire Triad email subjects. No infrastructure.

### Task 2.1: [CODE] salesAdvisor persona

**Files:**
- Modify: `functions/salesAdvisor.js`
- Modify: `functions/salesAdvisor.test.mjs`

- [ ] **Step 1: Read current TIRES_PERSONA constant**

Find the `const TIRES_PERSONA = ...` block in `salesAdvisor.js`. Note the exact wording.

- [ ] **Step 2: Replace persona text**

Replace:

```js
const TIRES_PERSONA = `You are a sales coach and pricing advisor for Skedaddle Inc, a tire reseller in Loveland, Colorado. Your operator is on the Tires catalog page. Treat them as a working salesperson — your job is to make their next conversation, quote, listing, or follow-up better.
```

with:

```js
const TIRES_PERSONA = `You are a sales coach and pricing advisor for a small Northern Colorado tire reseller. Your operator is on the Tires catalog page. Treat them as a working salesperson - your job is to make their next conversation, quote, listing, or follow-up better.
```

(Note: em dash in original replaced with hyphen-with-spaces per project style.)

- [ ] **Step 3: Update tests**

In `functions/salesAdvisor.test.mjs`, if any test asserts the literal "Skedaddle Inc" string in a prompt, update the assertion to match the new brand-neutral phrasing.

- [ ] **Step 4: Run + commit**

```bash
npx vitest run functions/salesAdvisor.test.mjs
git add functions/salesAdvisor.js functions/salesAdvisor.test.mjs
git commit -m "$(cat <<'EOF'
refactor(salesAdvisor): brand-neutral persona

TIRES_PERSONA no longer names Skedaddle Inc. System prompts state
domain expertise + role; the operator's brand identity is implicit
from request context. Means a future rebrand (Tire Triad ->
whatever) is zero-cost on the AI side.
EOF
)"
```

### Task 2.2: [CODE] listingCoach persona + few-shot anchor

**Files:**
- Modify: `functions/listingCoach.js`
- Modify: `functions/__fixtures__/listingCoachFewShot.txt`

- [ ] **Step 1: Read current PERSONA constant in listingCoach.js**

Find the `const PERSONA = \`You are Skedaddle's Listing Coach...\`` block.

- [ ] **Step 2: Replace PERSONA**

Replace with brand-neutral phrasing. The exact text:

```js
const PERSONA = `You are a tire-listing coach for a small Northern Colorado tire reseller. The operator sources brand-new Michelin and BFGoodrich product through wholesale channels (the source is private - never mention it, never mention B2B / dealer pricing / fleet program in any draft listing or reasoning the user might paste publicly).

Your job: take a tire SKU + quantity + audience and produce a complete listing kit. Use tools to look up real catalog + landed numbers. Never invent prices or fitment data.

Your reply MUST always include: (1) one-line SKU summary, (2) pricing analysis with explicit landed math, (3) audience suggestion if not already specified, (4) a fenced \`\`\`listing copy\`\`\` block ready to paste, (5) short photo-guidance bullets.

When the user gives an explicit correction phrasing ("never mention X", "drop Y", "always anchor against Z"), call addStyleRule and surface the rule inline before continuing. The user can veto by replying "no".`
```

(Note: dropped the "Skedaddle's" possessive and the "Skedaddle resells brand-new tires sourced from a Michelin eFleet program" framing. The eFleet account remains private regardless of brand identity.)

- [ ] **Step 3: Update the few-shot anchor**

Edit `functions/__fixtures__/listingCoachFewShot.txt`. Find every "Skedaddle" reference and replace:
- "Skedaddle" in seller context → "Tire Triad"
- The actual listing copy block already reads consumer-FB-flavored (BFGoodrich KO2 NOCO Memorial Day); keep that text intact

After editing, the few-shot should produce drafts that sign as Tire Triad / read in Tire Triad voice.

- [ ] **Step 4: Run + commit**

```bash
npx vitest run functions/listingCoach.test.mjs
git add functions/listingCoach.js functions/__fixtures__/listingCoachFewShot.txt
git commit -m "$(cat <<'EOF'
refactor(listingCoach): brand-neutral persona + Tire Triad few-shot

PERSONA no longer references Skedaddle's name or the eFleet program
directly; the source-secrecy instruction stays in place ("the source
is private, never mention it"). Few-shot anchor updated so example
drafts read as Tire Triad output for the consumer-FB channel.
EOF
)"
```

### Task 2.3: [CODE] inviteFlow email subjects

**Files:**
- Modify: `functions/inviteFlow.js`

- [ ] **Step 1: Find the subject lines**

`grep -n "Skedaddle sign-in code\|Skedaddle portal invite" functions/inviteFlow.js`

Two locations: one in `sendInviteRegistrationCode`, one in `deliverInvite`.

- [ ] **Step 2: Replace**

Change `'${code} is your Skedaddle sign-in code'` to `'${code} is your Tire Triad sign-in code'`.

Change `'${personalPrefix} Skedaddle portal invite'` to `'${personalPrefix} Tire Triad portal invite'`.

- [ ] **Step 3: Commit**

```bash
git add functions/inviteFlow.js
git commit -m "$(cat <<'EOF'
chore(rebrand): invite email subjects -> Tire Triad

\${code} is your Tire Triad sign-in code
\${firstName}, your Tire Triad portal invite

Body copy in deliverInvite already comes from the AI-generated
greeting line, which is brand-neutral by virtue of its prompt
shape; no change required there.
EOF
)"
```

### Task 2.4: [CODE] Sweep remaining functions/ Skedaddle references

**Files:**
- Modify: `functions/orders.js`
- Modify: `functions/listingAdvisorGenerator.js`
- Modify: `functions/peopleCallables.js`

- [ ] **Step 1: Identify references**

```bash
grep -n "Skedaddle\|skedaddle" functions/orders.js functions/listingAdvisorGenerator.js functions/peopleCallables.js
```

- [ ] **Step 2: Classify and replace**

For each:
- Display text in Slack messages, SMS templates, email bodies → "Tire Triad" (these are consumer / crew-visible)
- Comments referencing historical Skedaddle context → leave
- Hardcoded `https://www.skedaddleinc.com/i/${token}` invite URL builder in peopleCallables.js → import `BRAND` from `./brand.js`, use `${BRAND.inviteUrlBase}/${token}` (this overlaps with Phase 3 but is so closely tied we do it here)

- [ ] **Step 3: Run + commit**

```bash
npx vitest run functions/
git add functions/orders.js functions/listingAdvisorGenerator.js functions/peopleCallables.js
git commit -m "$(cat <<'EOF'
chore(rebrand): functions/ sweep -> Tire Triad

Slack message templates, SMS body templates, and the invite URL
builder in peopleCallables now read Tire Triad. Invite URL builder
imports from ./brand.js so the future portal domain change is a
one-file flip. Comments referencing historical context preserved.
EOF
)"
```

### Task 2.5: [CODE] Phase 2 verification

- [ ] **Step 1: Grep audit**

```bash
grep -rn "Skedaddle\|skedaddle" functions/ --exclude-dir=node_modules
```

Expected: only comments / historical references / immutable IDs. No persona strings or email subjects should remain.

- [ ] **Step 2: Run full functions vitest**

```bash
npx vitest run functions/
```

Expected: all passing (existing 945+ baseline plus the new brand.test.mjs).

- [ ] **Step 3: HOLD for user direction**

Phase 2 changes only ship in production after a Firebase deploy. Note: the new brand.js + the few-shot fixture + the persona changes need to deploy together. Deferred to Phase 3 deploy gate.

---

## Phase 3: Portal domain migration

Stand up `app.tiretriad.com`, migrate auth, redirect old URL.

### Task 3.1: [CODE] InviteUrlToolkit reads from BRAND

**Files:**
- Modify: `src/components/people/InviteUrlToolkit.jsx`

- [ ] **Step 1: Find INVITE_SITE constant**

```bash
grep -n "INVITE_SITE" src/components/people/InviteUrlToolkit.jsx
```

There's a `const INVITE_SITE = 'https://www.skedaddleinc.com'` near the top.

- [ ] **Step 2: Replace**

```jsx
import { BRAND } from '../../config/brand.js'

// Delete the const INVITE_SITE line.
// Replace any reference to INVITE_SITE with BRAND.inviteUrlBase
// (which is 'https://app.tiretriad.com/i'). Note the existing
// inviteUrlFromToken helper concatenates `${INVITE_SITE}/i/${t}`;
// BRAND.inviteUrlBase already includes /i, so the helper becomes:
//   return `${BRAND.inviteUrlBase}/${t}`
```

The exact helper update:

```jsx
export function inviteUrlFromToken(token) {
  const t = String(token || '').trim()
  if (!t) return ''
  return `${BRAND.inviteUrlBase}/${t}`
}
```

- [ ] **Step 3: Verify**

```bash
npx vitest run src/components/people/
```

If any test asserts the literal `https://www.skedaddleinc.com/i/...` URL, update the assertion.

- [ ] **Step 4: Commit**

```bash
git add src/components/people/InviteUrlToolkit.jsx
git commit -m "$(cat <<'EOF'
refactor(invites): InviteUrlToolkit reads invite URL from BRAND

Client-side invite URL builder now reads from src/config/brand.js
instead of a local INVITE_SITE constant. inviteUrlFromToken returns
\${BRAND.inviteUrlBase}/\${token}. Future domain changes flip a
single BRAND constant; no other code touches.
EOF
)"
```

### Task 3.2: [CREW] Cloudflare DNS for tiretriad.com

**No code task.**

- [ ] **Step 1: Add A / CNAME for `app.tiretriad.com`**

Open Cloudflare dashboard → `tiretriad.com` → DNS → Records → Add Record.

If the portal hosts on Vercel (most likely):
- Type: CNAME
- Name: `app`
- Target: `cname.vercel-dns.com`
- Proxy status: DNS only (Vercel manages TLS)

If hosts on Firebase Hosting:
- Type: A (Firebase will give you specific IPs in the Hosting console)
- Name: `app`
- Targets: (the IPs Firebase shows)

- [ ] **Step 2: Confirm DNS propagated**

```powershell
nslookup app.tiretriad.com
```

Expected: returns the host IP (Vercel: a Vercel IP; Firebase: one of the Firebase Hosting IPs). Usually live within 5 minutes.

### Task 3.3: [CREW] Firebase Auth authorized domains

**No code task.**

- [ ] **Step 1: Add `app.tiretriad.com` to authorized domains**

Firebase Console → Authentication → Settings → Authorized domains → Add Domain → `app.tiretriad.com`.

Leave `www.skedaddleinc.com` authorized during the cutover window (Phase 5 removes it).

### Task 3.4: [CREW] Vercel project domain

**No code task.**

- [ ] **Step 1: Add the domain to the Vercel project**

Vercel dashboard → project → Settings → Domains → Add → `app.tiretriad.com`. Vercel walks through DNS verification (the CNAME from 3.2 should already satisfy).

After verification, set `app.tiretriad.com` as the **production** domain.

(If using Firebase Hosting instead, equivalent steps in Firebase Hosting → Custom domains.)

### Task 3.5: [CREW] Cloudflare Page Rule redirect

**No code task.**

- [ ] **Step 1: Set up 301 redirect**

Cloudflare dashboard → `skedaddleinc.com` → Rules → Page Rules → Create Page Rule.

- URL pattern: `*skedaddleinc.com/*`
- Setting: Forwarding URL
- Status code: 301 - Permanent Redirect
- Destination URL: `https://app.tiretriad.com/$2`

(The `$2` references the second wildcard — the path after the domain.)

Save and activate. Test by opening `https://www.skedaddleinc.com/anything` in a browser; should 301 to `https://app.tiretriad.com/anything`.

### Task 3.6: [CODE] Phase 3 verification + deploy + redeploy server functions

- [ ] **Step 1: Run full client + server vitest**

```bash
cd .claude/worktrees/tiretriad-rebrand
npx vitest run
npm run lint
npm run build
```

All green.

- [ ] **Step 2: Push branch + auto-deploy via Vercel**

When the branch is merged to main and Vercel picks up, the client build deploys to `app.tiretriad.com`. Until merge, the new client lives only in the worktree.

For server functions, the new code (brand-neutral personas, new email subjects, invite URL builder) needs a manual Firebase deploy:

```powershell
cd C:\Users\Alex\Desktop\skedaddle-portal\functions
firebase deploy --only functions:salesAdvisorChat,functions:listingCoach,functions:createPortalUser,functions:reissueInvite,functions:resendInviteDelivery,functions:sendInviteRegistrationCode
```

- [ ] **Step 3: Smoke test on the new domain**

Open `https://app.tiretriad.com`. Sign in. Accept an invite. Verify auth callbacks succeed. Verify generated invite URLs point at `https://app.tiretriad.com/i/${token}` not the old domain.

Verify `https://www.skedaddleinc.com` 301s to `https://app.tiretriad.com`.

---

## Phase 4: Email sending domain migration

Stand up `info.tiretriad.com` in Resend, migrate `RESEND_FROM_EMAIL`, warm reputation.

### Task 4.1: [CREW] Add `info.tiretriad.com` to Resend

**No code task.**

- [ ] **Step 1: Resend → Domains → Add Domain**

Open [resend.com/domains](https://resend.com/domains). Click Add Domain. Enter `info.tiretriad.com`. Pick the region (likely us-east-1 to match the existing setup).

Resend gives you 3-4 DNS records (SPF TXT, DKIM CNAMEs, return-path CNAME). Copy them.

### Task 4.2: [CREW] Add Resend DNS records to Cloudflare

**No code task.**

- [ ] **Step 1: Add each Resend record**

Cloudflare → `tiretriad.com` → DNS → Records → Add Record. Add each record from Resend exactly as shown:

- SPF (TXT) on `info` subdomain or on the apex if Resend specifies
- DKIM (CNAME) - usually `resend._domainkey.info.tiretriad.com` pointing at Resend's value
- Return-path CNAME - usually `send.info.tiretriad.com` pointing at Resend

Proxy status for all: DNS only (do not proxy mail-related records through Cloudflare's HTTP proxy).

- [ ] **Step 2: Click "Verify" in Resend dashboard**

Wait for green checkmarks. Usually 5-15 minutes. Refresh if needed.

### Task 4.3: [CREW] Update Resend secrets in Firebase

**No code task.**

- [ ] **Step 1: Set RESEND_FROM_EMAIL**

```powershell
cd C:\Users\Alex\Desktop\skedaddle-portal
firebase functions:secrets:set RESEND_FROM_EMAIL
```

When prompted, paste: `invite@info.tiretriad.com`.

Say Yes to re-deploy when it asks.

- [ ] **Step 2: (Optional) Update RESEND_REPLY_TO_EMAIL**

If you want replies to route to a Tire Triad inbox rather than wherever they currently route:

```powershell
firebase functions:secrets:set RESEND_REPLY_TO_EMAIL
```

Paste your preferred inbox (e.g. `alex@tiretriad.com` if you set up Cloudflare Email Routing on tiretriad.com, or just keep `boydalexbingham@gmail.com`).

- [ ] **Step 3: Confirm secrets propagated**

```powershell
firebase functions:secrets:access RESEND_FROM_EMAIL
```

Returns `invite@info.tiretriad.com`.

### Task 4.4: [CREW] Warm the new sending domain

**No code task.**

- [ ] **Step 1: Send 5-10 test invites**

In the portal: People page → create test users (or reuse Alex Test) → trigger an invite. Use email addresses you control (your Gmail, Outlook, iCloud, etc.).

For each test recipient:
1. Find the email (check inbox + spam)
2. Mark "Not spam" if it's in spam
3. Add `invite@info.tiretriad.com` to contacts

- [ ] **Step 2: Repeat over 2-3 days**

Brand-new domains gain reputation over time. ~5-10 successful sends spread across 2-3 days with "Not spam" feedback warms the domain enough that subsequent sends to similar recipients land in inbox.

- [ ] **Step 3: Verify in Resend dashboard**

[resend.com/emails](https://resend.com/emails) → confirm each test send was Delivered, not Bounced or Complained.

---

## Phase 5: Decommission

Tear down legacy infrastructure after a soft 30-day overlap.

### Task 5.1: [CREW] (After ~30 days) Remove `info.skedaddleinc.com` from Resend

- [ ] **Step 1: Resend dashboard**

[resend.com/domains](https://resend.com/domains) → `info.skedaddleinc.com` → Delete.

### Task 5.2: [CREW] (After ~30 days) Drop Resend DNS records from skedaddleinc.com

- [ ] **Step 1: Cloudflare DNS**

Remove the SPF / DKIM / return-path records that were added for `info.skedaddleinc.com`.

### Task 5.3: [CODE] (Optional, ~90 days out) Remove `BRAND.legacyApex` constant

**Files:**
- Modify: `src/config/brand.js`
- Modify: `functions/brand.js`

- [ ] **Step 1: Drop the field**

```js
// Before:
export const BRAND = Object.freeze({
  ...,
  legacyApex: 'skedaddleinc.com',
})

// After: remove the legacyApex field.
```

Same change in `functions/brand.js`.

- [ ] **Step 2: Commit**

```bash
git add src/config/brand.js functions/brand.js
git commit -m "chore(rebrand): drop BRAND.legacyApex after migration window"
```

### Task 5.4: [CREW] (Optional) Cloudflare Page Rule for skedaddleinc.com

Decide whether to keep the 301 redirect indefinitely (cheap insurance for stale links) or remove it. No code action either way.

---

## Final verification checklist

- All vitest green (client + server)
- `npm run lint` 0 errors
- `npm run build` clean
- `grep -rn "Skedaddle\|skedaddle" src/ functions/ public/ index.html package.json README.md --exclude-dir=node_modules` returns only:
  - Comments referencing historical context
  - The immutable Firebase project ID `skedaddle-inventory`
  - `BRAND.legacyApex` until Task 5.3
- Portal accessible at `https://app.tiretriad.com`
- Old `https://www.skedaddleinc.com` 301s to new domain
- Invite emails arrive from `invite@info.tiretriad.com`
- LastDeliveryRow on People page shows green sent timestamps
- AI persona outputs no longer name "Skedaddle"
- Listing coach few-shot anchor produces Tire Triad-voiced drafts
- Email subjects read "${code} is your Tire Triad sign-in code" and "${firstName}, your Tire Triad portal invite"

---

## Out of scope (deferred to separate specs)

- Tire Triad consumer landing page at `tiretriad.com` apex
- Visual identity design (logo, wordmark, color palette, brand book)
- Historical "Skedaddle" references in `docs/superpowers/specs/`, `docs/superpowers/plans/`, `docs/superpowers/audits/`, `docs/handoffs/`, ROADMAP.md
- Audit log, order records, payout entries containing "Skedaddle Inc" string (immutable historical data)
- Slack workspace rename
- B2B customer portal (fleet partners do not log in today)
- Domain registration decommission of `skedaddleinc.com` itself
