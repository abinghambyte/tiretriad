# Command palette refresh — design spec (STORMED 2026-04-27)

**Status:** Stormed. Implementation captured as `docs/handoffs/patch-623-command-palette-refresh.md`.

## Pre-storm state

The portal has had a fully-functional Cmd+K command palette since before this storm. Existing features:

- ✅ Cmd+K / Ctrl+K trigger
- ✅ 14 navigation entries with permission gating + keyword aliases
- ✅ 5 selection-context actions (Log sale, Quote, Generate listings, Bulk overhead, Clear)
- ✅ Live entity search across tires / orders / contacts / crmAccounts (≥2 chars)
- ✅ Keyboard nav, archived-doc filtering (PR #171), tab-aware redundancy suppression
- ✅ Subscribes to TiresDashboard's tireSelectionStore for context

The audit's complaint was the **trigger UX** ("tiny [Q] button, no visible scope"), not the palette itself. So this storm is gap-closing across three axes: trigger discoverability, empty-state workflow acceleration, and mobile + alias polish.

## Storm decisions

### Q1 — Trigger UX: dual-presentation, single component

**Decision:** Same `CommandPaletteTrigger` component, conditional rendering via Tailwind `hidden max-sm:flex` and `hidden sm:flex`.

- **Desktop (sm+):** wide `<div>` styled like an input (border, rounded, muted bg matching card style), `max-w-sm` (384px), magnifying glass left-aligned, placeholder text "Search tires, orders, contacts…", right-aligned `⌘K` `<kbd>` badge. Hover darkens bg slightly. **Not a real `<input>`** — clicking opens the palette modal; using a real input creates focus-trap weirdness.
- **Mobile (max-sm):** keep existing 44×44 icon button. Tap to open. Icon-only is fine because mobile users aren't keyboard-shortcut fluent and tap-to-open matches every other icon button in the header.

**Rationale (from storm session):** "the shape IS the documentation." Audit complaint was "I can't see what this thing does or what it can find." Search-shaped silhouette + honest placeholder answers both. Wide bar on desktop matches muscle memory from Vercel / Stripe / Linear / Notion. Mobile keeps the existing icon to avoid eating header real estate.

### Q2 — Empty-state behavior: Recent + Suggested

**Decision:** When the palette opens with empty query, show three sections in this order:

1. **Recent** (up to 5, only render if ≥1 entry exists) — last 5 actions actually fired, FIFO eviction. Stored in `localStorage` key `skedaddle.palette.recent` as JSON array of action IDs (reusing existing nav/selection IDs, no parallel ID scheme).
2. **Suggested** (3 context-aware entries, route-keyed map) — hardcoded in `src/lib/palette/suggestions.js`. Per-route lists:
   - `/tires` → "Generate listings", "Bulk overhead", "Export CSV"
   - `/crm` → "Add lead", "Open pipeline"
   - `/analytics` → "Open Wall", "Open Revenue"
   - `/dashboard` → "Open Tires", "Open CRM", "Open Analytics"
   - `/people` → "Invite crew member", "View access log"
   - Unmapped routes render no Suggested section (no global default — generic Suggested is noise).
3. **Selection** (existing) — only when tires are selected.
4. **Navigation** (existing) — full list, gated by permissions.

Plus a **muted footer line** at the bottom of the modal: "Type 2+ characters to search tires, orders, contacts, leads…" Always visible at empty state, hides once `query.length >= 1`. This is the only place users learn entity search exists.

**Rules:**
- Recent commits **only when an action actually fires** (not on hover, not on arrow-key navigation).
- Entity search hits **never** enter Recent — their IDs aren't stable references; a recently-archived tire showing up in Recent is worse than no Recent.
- Empty Recent renders **nothing** at the section position — no "No recent actions" placeholder copy.
- **Dedupe across sections:** if an action is in Recent, suppress it from Suggested + Navigation below. Same suppression pattern as the existing tab-aware redundancy logic.
- localStorage write wrapped in `try/catch`. Failed writes silently no-op (Safari private mode + storage-quota errors). Recent is nice-to-have, not a hard dependency.

**Rationale:** Recent turns the palette from a navigation tool into a workflow accelerator. With a small crew doing repetitive tasks, the second time anyone does anything the action they want is in the top three. Hundreds of saved scans per week for zero ongoing cost.

### Q3a — Aliases

**Decision:** Add the following to existing keyword arrays:

| Action | Existing keywords | Add |
|---|---|---|
| `nav-tires` | `['catalog', 'inventory']` | `'tires', 'skedaddle', 'skedaddle tires'` |
| `nav-crm` | `['pipeline', 'leads', 'vip']` | `'crm', 'rubber', 'rubber crm', 'fleet crm'` |
| `nav-people` | `['crew', 'users', 'contacts']` | `'people', 'people systems'` |
| `nav-ops` | `['expenses', 'credit', 'reorder']` | `'ops', 'ops command'` |
| `nav-growth` | `['experiments', 'tools']` | `'growth', 'growth lab'` |
| `nav-analytics` | `['wall', 'metrics', 'revenue', 'reports']` | (no add — covered) |
| `nav-dashboard` | `['home']` | (no add — covered) |
| `nav-admin` | `['settings']` | (no add — covered) |

**5-minute audit during handoff** — before adding bare module aliases, search the palette for "tires" with current code. Verify `nav-tires` ranks first. If canonical-name matching already handles bare words with equal weight to aliases, the bare-word additions are redundant but harmless. If aliases rank higher, they're necessary. Either way the result is correct; this audit only determines whether the keyword additions are belt-and-suspenders or load-bearing.

**`'fleet crm'` rationale:** the rename is recent. Muscle memory persists. External references (old Slack messages, screenshots, anyone Alex sends the portal link to) still say "Fleet CRM." Keep for at least 6 months past full crew adoption.

### Q3b — Mobile palette: full-screen overlay

**Decision:** On `max-sm`, the palette modal goes full-screen via `max-sm:inset-0 max-sm:rounded-none` plus removing centering classes at the mobile breakpoint. Probably ~4 lines of Tailwind changes to the existing modal container.

**Why:** bottom-sheet sounds nicer abstractly, but it's a primitive we don't have. New animation timing, new dismiss-gesture handling, new swipe-down-close test cases. Full-screen dodges the keyboard-squeeze problem entirely (entire viewport is the palette; keyboard pushes scrollable content as expected).

**Mobile-only additions:**
- **Explicit close button** in top-right (44×44, same icon style as portal). Tap-outside-to-dismiss doesn't exist when there's no outside.
- **Esc-to-close** keyboard handler stays for both desktop and mobile (mobile keyboards have ESC).

**z-index check during handoff:** verify the palette modal is above the header. Existing modals use `z-50`. If the portal header uses `z-40` or lower, fine. If header is `z-50` / `sticky` with no explicit z-index, bump the palette to `z-[60]`. One-line check.

### Q3c — Theme/Sign out: keep exclusion

**Decision:** Keep the existing exclusion documented in `CommandPalette.jsx:14-18`. Theme toggle and sign-out remain header-pill-only.

**Update the comment** in this PR with date + rationale:

```js
/**
 * ...
 * Theme and sign-out remain header-pill-only (decision reviewed
 * 2026-04-27). Palette scope is navigation and entity workflows.
 * Revisit if header pill is removed or relocated.
 */
```

**Why:** duplication-of-truth concern is real. If a future PR moves theme toggle to a settings page, palette entry would have to update in lockstep or point at dead command. Header pill is the canonical surface for account-level controls.

## Out of scope

- Power-user features (favorites, custom commands)
- Analytics tracking on palette use (could ship as a follow-on if usage patterns matter)
- Cmd+K-launched workflow recordings / multi-step actions

## Single-PR scope

All three storm decisions ship in **one cohesive PR** — same component tree, same test fixtures, same audit-the-deploy pass. Run `npm run lint && npm run build` and verify on both desktop (Vercel preview) and mobile (Chrome DevTools 375px) before merging to main.

## Decision log

- **Single CommandPaletteTrigger component**, not separate desktop/mobile components — keeps keyboard handler + analytics hook in one place
- **Wide-bar visual on desktop is a `<div>` not `<input>`** — clicking opens modal, real input creates focus-trap weirdness
- **Recent only commits on execute** — not on hover/arrow, since muscle-memory traversal is not intent
- **Entity search results never enter Recent** — unstable IDs + archived-doc surprise
- **No global "Suggested" default** — generic suggestions are noise; empty Suggested is fine on unmapped routes
- **Footer hint always visible at empty state** — only place users learn entity search exists
- **Full-screen mobile overlay over bottom-sheet** — no new primitive, dodges keyboard squeeze
- **Theme/sign-out exclusion documented in code** — date + rationale + revisit condition

## Next step

Dispatch `docs/handoffs/patch-623-command-palette-refresh.md`. Single PR, single audit, single deploy.
