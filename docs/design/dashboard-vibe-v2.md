# Skedaddle Portal - Dashboard redesign (v2)

A design brief for Stitch (or any UI/UX tool that accepts a prose spec) to produce a new visual design for the Skedaddle Portal dashboard. No code in this document; the goal is a set of mockups we can then translate back to React + Tailwind.

Return deliverable: static mockups at 1440px desktop and 390px mobile for every screen region listed in section 5, plus a short rationale of the design choices. Mockups should use real example data (numbers, names, order IDs) not lorem ipsum.

---

## 1. Product snapshot

Skedaddle Portal is the internal operations tool for a two-to-five-person tire resale business in northern Colorado. Crew logs in on mobile while in the field and on laptops in the office. The dashboard is the first screen every role sees after sign-in. It is not a marketing page and not a customer surface. It should feel like an instrument panel for an operator who already knows what each number means.

Audiences:

- **Overwatch (admin)** - the owner. Sees everything, makes money decisions, runs the catalog. Wants a fast glance at money + what to act on right now.
- **Sourcer** - scouts tires, logs them into the catalog, handles listings. Wants the tire-catalog pulse and anything flagged for reposting.
- **Field crew** - completes orders in the field. Wants to know what is assigned and what is pending pickup / delivery.
- **Viewer** - occasional reviewer. Read-only.

The tone is: professional, confident, a little bit of personality. Not corporate SaaS, not gamer-dark, not neon. Think "a good dashboard in a high-end service truck."

---

## 2. What is working and must survive

Keep these elements or patterns - the redesign should refine them, not replace them.

- **Dark palette.** Background is near-black (`zinc-950`). Text is near-white. Accents are carefully restricted; we do not want a rainbow.
- **Subtle background treatment.** There is a radial gradient (amber glow top-center, faint cyan top-right) and a fine grid at roughly 64 x 64 px. Both are at very low opacity. Keep this or replace with something with similar restraint.
- **Dense, tabular numbers.** We use a tabular monospace style (class hook `sk-figures`) for any count or currency so columns align visually.
- **Status pills.** Orders have short uppercase status labels ("PENDING", "IN TRANSIT", "COMPLETE"). Customers and crew have role tags ("Sourcer", "Field crew", "Overwatch"). These pills are two-tone (tinted background + tinted text) and should stay readable on dark.
- **Typography hierarchy.** Small uppercase section headings (tracking-wide, zinc-500). Body text zinc-100 to zinc-300. Captions zinc-500 to zinc-600.
- **Accent colors in current use** (we like them, keep the semantic meaning even if the hues shift):
  - **Amber** - attention, pending, warning that can be fixed
  - **Rose / red** - problem, crew alert, severe margin issue
  - **Teal** - Tires / catalog
  - **Orange** - CRM
  - **Green / emerald** - Analytics / completed / success
  - **Slate** - People
  - **Violet** - Internal-only / admin-only labels

---

## 3. Pain points to solve

These are the specific frustrations the current dashboard causes. Every one of them should be visibly better in the new design.

1. **The dashboard feels plain compared to an earlier iteration.** It has lost "vibe." Operators scroll past it rather than feeling pulled in. We need more visual confidence - subtle gradients, accent bars, purposeful motion - without sacrificing legibility.

2. **Clickable surface feels arbitrary.** The four big KPI cards at the top are fully clickable (good). The six module tiles at the bottom look clickable but only the button at the bottom of each actually navigates (bad - we want the whole card to be clickable again). Decide one rule and apply it everywhere.

3. **"Overhead not set" always shows amber.** When the unset count is zero, the row is still treated as a warning. Zero is a good state, not a yellow-flag state. Distinguish "no overhead missing" from "some overhead missing."

4. **"Below 15% margin" flag is too loud and cannot be dismissed.** It screams at the operator forever about tires whose cost is structurally fixed. We need two affordances surfaced from this row:
   - **Dismiss / silence** a specific tire (acknowledge the low margin but keep it in catalog).
   - **Archive** a tire (hide it from catalog, queue it for deeper research before it returns).

   The red row itself should be compact and useful at a glance, not alarming by default.

5. **Crew widget is directory data, not dashboard data.** It shows name + role + "active / pending invite" + last login. We want it to answer "what is each person doing right now and how are they doing this week." See section 5.4.

6. **Module tile row feels repetitive.** Six tiles, similar visual weight, all with the same "Live" badge. They read as a navigation index, not as status snapshots. Consider whether this row should be smaller, or grouped differently, or replaced with a more lightweight module chooser.

---

## 4. Design goals

The new design must hit all of these. Use them as acceptance criteria for your mockups.

1. **Operator vibe.** The first impression should read "this is where the work happens," not "this is a slide deck." Achieved through accent bars, restrained color, confident type, and purposeful micro-motion on hover.

2. **Legibility at a glance.** Every number should be readable in under one second. No more than two typefaces. Numbers use tabular figures.

3. **Actionable states.** Every flag on this page has a path to resolution. A red number should never be something the operator can only stare at.

4. **Role-aware density.** Same layout across roles, but rows the current user cannot act on should recede (lower contrast, no accent) rather than disappear. Viewers must not see an empty dashboard.

5. **Mobile does not truncate meaning.** Every card on desktop has a mobile treatment that keeps the same information, reflowed - not hidden. The only thing safe to hide on mobile is the Modules section (bottom nav already handles navigation on phone).

6. **Performance feel.** Skeleton loaders for every section while data streams in. Content never jumps in.

---

## 5. Surface-by-surface spec

The dashboard has six logical regions, in this order, inside a centered 1152px max-width main column. Each region below has:

- **Purpose** - what the operator learns from it
- **Data shown** - the fields currently populated in the codebase (Stitch does not need to hit the data; these are labeled so mockups show real-looking content)
- **Current treatment (brief)** - what is on screen today
- **Redesign direction** - the visual / interaction change we want

### 5.1 Header notice (conditional)

**Purpose:** Surface a one-shot message - e.g. "That module is not available for your current clearance." - when the user landed on the dashboard after being redirected away from a gated page.

**Current treatment:** Amber-tinted strip at the top, "Dismiss" button on the right.

**Redesign direction:** Keep. Refine the visual weight to match the rest of the page. If the rest of the dashboard has a new accent treatment, the notice should pick up the same language.

### 5.2 "Today" signal strip

**Purpose:** Four numbers that tell the operator what to do right now. This is the most important surface on the page.

**Data shown (labels and example values):**

| Label | Example | Meaning |
| --- | --- | --- |
| Pending orders | `3` | Count of orders in any active pipeline stage. Amber tone when > 0. Links to `/orders`. |
| Needs reposting | `0` | Tires that were posted to marketplaces but are stale on all platforms. Amber tone when > 0. Links to `/tires?needsReposting=true`. |
| Today revenue | `$0.00` | Denver-day revenue total from Firestore `meta/revenueStats`. Neutral tone (currency, not a warning). Links to `/analytics?tab=revenue`. |
| Crew alerts | `1` | Pending crew invites + locked accounts. Rose tone when > 0. Links to `/people`. |

**Current treatment:** Four equal-width cards in a 4-column grid on desktop, 2-column on mobile. When a card's value is nonzero and it is a warning metric, the border + background pick up a tinted hue (amber or rose). Whole card is a link.

**Redesign direction:**
- **Stronger signal at a glance.** When a card is in its warning state, it should read as "this wants your attention" - maybe an animated amber pulse on the left edge, maybe a subtle iconographic tell. When it is in its resting state, it should feel quiet.
- **Keep whole-card click.** This part of the page already works - don't regress it.
- **Zero-safe rendering.** A value of `0` for "Pending orders" should feel like a win, not a neutral state. Consider a tiny green check when a warning metric crosses into zero, or a subtle "all clear" label.
- **Revenue card has personality.** "Today revenue" is the money moment. If it makes sense, this one card can carry the most visual weight - a soft gradient, a larger number, a tiny sparkline of the last 7 days if Stitch can invent a plausible one.

### 5.3 Catalog health

**Purpose:** Operator-facing count of catalog issues that need action. Always visible under the signal strip on the left half (on desktop) next to Recent Activity.

**Data shown:**

- **Total tires** - e.g. `1,160`. Neutral, no action. Just a vital sign.
- **Overhead not set** - e.g. `0` or `8`. When `0`, this is a win state and should be visually quiet (a small check, muted text). When `> 0`, tint amber and link to `/tires?risk=missingOverhead`.
- **Below margin floor** - e.g. `96`. Always a link to `/tires?risk=lowMargin`, but see the major redesign below.

**Current treatment:** Three rows inside a card. Each row is a flex between label and count. Two of them are links (overhead-not-set is amber-tinted, below-15% is strongly red-tinted with a bordered box).

**Redesign direction:**
- **Zero-safe treatment for every row.** Overhead at 0 reads neutral. Margin-under-floor at 0 also reads neutral.
- **Below-margin row grows into a compact section with affordances.** Instead of a single red row, design this row to expand inline (or to a small drawer triggered by a chevron) and surface two per-tire actions:
  - **Silence** - acknowledge the low margin, keep the tire in catalog, stop counting it here. Shows as a subtle muted pill on the tire row.
  - **Archive** - move the tire out of the main catalog into a research queue. A badge tells the operator "Kyle will re-check retail pricing on this tire."
  Show a count next to the action: "12 silenced · 8 archived" so nothing disappears without a paper trail.
- **Variable threshold hint.** The label says "Below margin floor" rather than a literal `15%`. The floor is per-tire configurable (small value tires carry a lower margin floor than expensive tires because the absolute dollars matter too). In the mockup, show the label reading "Below margin floor" and a small tooltip icon that would explain the logic on hover. Threshold numbers no longer live on the card face.

### 5.4 Recent activity

**Purpose:** The 5 most recent orders regardless of status. Operator uses this to verify something they just did actually landed, or to spot-check what the crew logged overnight.

**Data shown (per row):**

- Short order ID (e.g. `#EKtZpfas`) - monospace, links to `/orders?highlight=<id>`
- Tire description OR MSPN fallback
- Customer name OR last 4 digits of phone fallback
- Status pill (`PENDING`, `IN TRANSIT`, `COMPLETE`, `CANCELLED`, etc.)
- Margin percentage (if the order carries one)
- Relative time ("7d ago", "8d ago")

**Current treatment:** Unstyled list with dividers. Each row has two columns - left content block, right-aligned metadata stack. Works but looks like a bare `<ul>`.

**Redesign direction:**
- Give each row a subtle hover lift so it feels alive.
- Treat the status pill as a small accent. Complete = green tint. Cancelled = zinc. Pending = amber. In transit = teal. One color per status.
- A completed order row could carry a tiny win-mark (a small dollar icon, or an accent on the margin pill if the margin is above the house floor).
- If the order was logged via Sale Messenger vs. the backdated path, a small icon tells the operator which (optional; only if Stitch can imagine a clean treatment).

### 5.5 Crew (redesigned - this is the big ask)

**Purpose:** What is each crew member doing right now, and how are they doing this week. This replaces the current "directory" treatment.

**Data to show per crew row (all of these fields are already populated in the codebase; treat them as available inputs):**

| Field | Example | Notes |
| --- | --- | --- |
| Display name | "Alex Bingham" | Bold, primary text |
| Role tag | "Overwatch" | Existing small pill |
| WIP count | `2 in flight` | Count of orders assigned to this user with status in pending / in-transit / scheduled. New pill. |
| Today's completions | `3 today` | Count of orders this user completed since midnight (Denver TZ). New pill. |
| Streak | `🔥 6` or blank | Days in a row with at least one completion. Show flame icon only when streak >= 2. |
| Presence dot | green / grey | Active in last 15 min = green. Otherwise grey. Presence is v2; include in the mockup but note the data path is TBD. |
| Last seen (compact) | `3s ago` / `2d ago` / `never` | Secondary metadata |
| Status label | `Active` / `Pending invite` / `Locked` | The existing invite-status flag |

**Current treatment:** Two-column row. Left: name + role. Right: status + last-seen. Pending invites have an amber left border and "Pending invite / never." Locked accounts have a red border.

**Redesign direction:**
- Row structure: presence dot on the far left, name + role in the center-left, three pills stacked tightly on the right (WIP, today, streak), then status label and last-seen on the far right as secondary metadata.
- On small screens, drop to a 2-line layout: line 1 = presence + name + role; line 2 = the three pills.
- Pending invite rows stay dimmed with the amber left border and an obvious "Resend invite" action (tiny button in the secondary column). Locked rows stay red-tinted and uninteractive.
- Whole row is clickable; it opens that user's People detail page. (If the "Resend invite" button is present, clicking the button does not also trigger the row navigation.)
- Achievements (first $1k day, 10 completions, etc.) are **out of scope for v2** - leave room architecturally so a later pass can add a tiny badge row under the pills, but do not design the badges themselves yet.

### 5.6 Modules (navigation tiles)

**Purpose:** Secondary navigation to the six workspaces (Tires, CRM, People, Analytics, Growth Lab, Ops Command). Two of them (Growth Lab, Ops Command) are admin-only and should not render for non-admins.

**Data per tile:**

- Icon (already designed - teal tire, orange ledger, slate people, green bar chart, amber compass, rose terminal)
- Title - e.g. "Skedaddle Tires"
- 1-sentence description
- Status pill - "LIVE" for all six today
- A small stat line (e.g. "1,160 SKUs · price intel active")
- A CTA button at the bottom ("Open Catalog", "Open Pipeline", etc.)
- Accent color (teal, orange, slate, green, amber, rose) maps one-to-one to the module

**Current treatment:** Three columns on desktop. Each tile is a card with an accent bar on the left, an accent halo on the top-right, a square icon chip top-left, status pill top-right, title, description, a divider, the stat line, and a full-width CTA button.

**The CTA button is the ONLY clickable element.** The card itself does nothing. This is the main regression the operator is feeling.

**Redesign direction:**
- **Whole tile is the click target.** The CTA button can stay as a visual anchor, but the entire `<article>` is a link. Nested interactive elements are not present here so there is no accessibility conflict.
- **Tile can be smaller.** If the tile becomes a one-click surface, the big CTA button at the bottom is overkill. Consider a chevron in the corner plus a confident hover state (lift, accent glow) instead of a block button.
- **Consolidate redundant info.** Today each tile shows title + description + stat-label + stat + status + CTA. That is six text elements. Target three: title + stat + a tiny pill. The description can move to a hover reveal or go away entirely.
- **Admin-only tiles carry a small "Admin" tag** instead of or alongside "LIVE" so the role gating is legible at a glance.
- **Reorder by role.** For admin (Overwatch), first row is the money-adjacent modules (Ops, Analytics, Tires). Second row is the people-adjacent (CRM, People, Growth Lab). For non-admins, just the modules they can access, in a two-column or three-column grid depending on count.

### 5.7 Background and chrome

**Purpose:** Holds the page together.

**Current treatment:** Zinc-950 background, radial amber+cyan gradient top-center, fixed grid at ~64px, subtle opacity.

**Redesign direction:** Keep the idea but tune it. The grid is a little heavy on some laptop screens. The gradient could go slightly deeper or extend lower to tie the signal strip to the rest of the page. One tasteful accent motion - a very slow parallax on the gradient, or a very subtle light that plays across the top border on load - would add personality without becoming a distraction.

---

## 6. Visual language tokens

Designs should work within this token system so implementation is a translation, not a rebuild. These are Tailwind-compatible tokens; if Stitch needs hex, convert on the fly.

### 6.1 Core palette

| Token | Tailwind | Hex | Use |
| --- | --- | --- | --- |
| Background base | `bg-zinc-950` | `#09090b` | Page bg |
| Surface 1 | `bg-zinc-900` | `#18181b` | Card bg |
| Surface 1 tinted | `bg-zinc-900/40` | `#18181b @ 40%` | Subtler card bg |
| Surface hover | `bg-zinc-900/90` | same | Hovered card |
| Border base | `border-zinc-800` | `#27272a` | Card border |
| Border hover | `border-zinc-700` | `#3f3f46` | Hovered card border |
| Text primary | `text-zinc-50` | `#fafafa` | Numbers, headings |
| Text secondary | `text-zinc-200` | `#e4e4e7` | Body |
| Text muted | `text-zinc-400` | `#a1a1aa` | Metadata |
| Text quiet | `text-zinc-500` | `#71717a` | Captions |
| Text ghost | `text-zinc-600` | `#52525b` | Divider dots, time stamps |

### 6.2 Accent palette (semantic)

| Semantic | Tailwind example | Hex sample | Usage |
| --- | --- | --- | --- |
| Amber (attention) | `text-amber-300 bg-amber-950/10 border-amber-700/40` | `#fcd34d / #451a03 / #b45309` | Warnings that have a resolution path |
| Rose (problem) | `text-rose-300 bg-rose-950/20 border-rose-800/40` | `#fda4af / #4c0519 / #9f1239` | Crew alerts, severe states |
| Red (severe) | `text-red-300 bg-red-950/20 border-red-900/35` | `#fca5a5 / #450a0a / #7f1d1d` | Margin-under-floor flag |
| Teal (tires) | `bg-teal-500/12 text-teal-300 ring-teal-500/25` | `#2dd4bf` | Tires module, in-transit status |
| Orange (CRM) | `bg-orange-500/12 text-orange-300` | `#fb923c` | CRM module |
| Green (outcomes) | `bg-emerald-500/12 text-emerald-300` | `#6ee7b7` | Analytics, complete status, win states |
| Slate (people) | `bg-slate-500/12 text-slate-300` | `#cbd5e1` | People module |
| Violet (internal) | `bg-violet-500/12 text-violet-300` | `#c4b5fd` | Admin-only tag |

### 6.3 Typography

- **Primary font:** System sans. Implementation can use Inter or the system default - Stitch should pick a sans-serif with strong legibility at 12-14 px.
- **Numeric font:** Tabular-figure variant of the same family. In the current codebase this is handled via the class hook `sk-figures` and `tabular-nums`. Numbers are always monospace-aligned inside any card that has more than one of them.
- **Scale:**
  - Section heading - `text-xs` (12 px), `font-medium`, `uppercase`, `tracking-wide`, `text-zinc-500`
  - Card title - `text-lg` (18 px) / `text-base` (16 px) on compact, `font-semibold`
  - Big number - `text-2xl` (24 px), `font-semibold`, tabular-nums
  - Body - `text-sm` (14 px)
  - Caption - `text-xs` (12 px) or `text-[11px]` / `text-[10px]` for ultra-compact pills

### 6.4 Shape and elevation

- Card corners: `rounded-xl` (12 px) for regular cards, `rounded-2xl` (16 px) for hero cards (the signal strip and the Today's revenue card).
- Pills and tags: `rounded-full`.
- Elevation: cards are not elevated by shadow; they are elevated by border tone and a subtle backdrop-blur. No drop shadows larger than 2 px on the whole page.

### 6.5 Motion

- Hover transitions: 150-200 ms ease-out. Color, border, and translate-y only. No wiggle.
- Loading: skeleton (`animate-pulse` on a zinc-800 block) rather than spinners for data regions. Small spinners for button-level actions.
- One slow ambient motion is allowed - e.g. the background gradient drifting 1 px over 8 seconds - but nothing that would cause motion sickness or make the page feel busy.

---

## 7. Accessibility non-negotiables

- All text meets WCAG AA contrast against its surface at a minimum. Primary numbers at AAA.
- Every clickable card has a visible `focus-visible` ring. We do not hide focus.
- Never nest an `<a>` inside an `<a>`, or a `<button>` inside a `<button>`. If a card is clickable, the inner "resend invite" button should stop click propagation.
- Status is conveyed by more than color alone. The margin-under-floor row uses both red tint AND a label ("Below margin floor") AND a number. The crew presence dot is green-or-grey; it should also carry a sr-only label "active in last 15 min" or "last seen 2d ago."
- Icon-only controls have an aria-label.

---

## 8. Out of scope

Please do not redesign these in the same deliverable. They are stable and owned elsewhere.

- The top header bar (logo, search icon, theme toggle, help, user menu, sign-out button).
- The main navigation bar (Dashboard, Tires, CRM, People, Analytics, Ops, Admin).
- The command palette overlay (Cmd+K).
- Any page other than the dashboard (Tires catalog, CRM, People, Analytics, Ops, Admin).
- The `/vip/:token` customer page.
- Sign-in, handshake, invite flows.

---

## 9. Deliverable checklist

Stitch should return:

1. **Desktop mockup at 1440 px width** showing the full dashboard end-to-end.
2. **Mobile mockup at 390 px width** showing the same dashboard, scroll-length as needed, with Modules section hidden (per current behavior).
3. **Detail mockups** for:
   - The redesigned Catalog Health "Below margin floor" row in both collapsed and expanded states, including the silence / archive affordances.
   - The redesigned Crew widget row showing all pill states (WIP, today's completions, streak flame, presence dot).
   - A single module tile in its resting, hover, and admin-gated states.
4. **A short rationale** (200-400 words) explaining the design choices, especially around "vibe" - what was added, what was restrained, what tradeoffs were made.
5. **A token inventory** - any new color, radius, or motion values introduced beyond section 6. If Stitch invents a new accent hue, list it so we can add it to the Tailwind config.
6. **Optional but welcome:** an alternate "louder" variant of the signal strip for consideration, so we can A/B pick.

Mockups are acceptable as Figma frames, a Stitch gallery link, or flat PNGs. No code output is needed at this stage.

---

## 10. What happens after Stitch returns

The design gets reviewed in a single pass, then translated into a Cursor patch brief that lands the changes in `src/components/dashboard/`. Expected code-side impact per section, for Stitch's awareness (does not constrain the design):

- Signal strip - edit `Dashboard.jsx` `SignalCard` component
- Catalog health - edit the Catalog health section in `Dashboard.jsx`; the margin-floor affordances also require new Firestore fields (`tires/{id}.lowMarginAck`, `tires/{id}.archived`) and a new server-side filter; those are separate patches
- Crew widget - edit the Crew section in `Dashboard.jsx` and the `useDashboardSignals` hook to return the new per-user pill data; this is a separate patch
- Modules - edit `ProjectCard.jsx`; wrap the whole card in a `<Link>` and remove the dedicated CTA button
- Background - edit the fixed-position overlay divs at the top of `Dashboard.jsx`

Designs that disrespect these boundaries (e.g. require us to rebuild the nav bar) will be pushed back. Designs that elegantly hint at follow-on patches we should plan for are welcome - call them out in the rationale.

---

Questions while designing should come back to the Skedaddle owner (not implemented in Stitch's flow; ping via the delivery channel). Prefer to show two variants where you are unsure rather than commit to one.
