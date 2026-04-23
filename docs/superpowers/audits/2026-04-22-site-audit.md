# Full-site audit -- 2026-04-22

Scope: every remaining page not already covered by the Dashboard + Tires catalog
sweeps (PRs #88-#92). Four parallel agents audited Orders, Analytics + GrowthLab,
People/CRM/VIP/Wall, and Ops/Admin/Handshake/MechanicIntake/Invite/Landing.

Severity tags: **R** regression, **P** polish, **D** dead code, **A** a11y.

## Executive summary

Roughly 80 findings across 13 modules. No site-stopping regressions, but two
Firestore read-cost bugs, one data-visibility regression, and a stack of
consistency/a11y gaps that keep showing up in the same shapes.

The cross-cutting offenders swamp the one-offs. Fixing the five patterns in the
next section knocks out ~60% of the list without touching feature logic.

## Cross-cutting patterns (fix these first)

### 1. Em dashes in shipping strings -- NON-NEGOTIABLE

Standing rule in `MEMORY.md`: no em dashes (`--`) in anything published. The
audit found them scattered across Analytics, GrowthLab, Orders, Ops, Wall, and
the PayoutConfigPanel. Every one is user-visible fallback text.

Hits:

- `src/pages/AnalyticsPage.jsx:240, 295, 423, 428, 430, 463, 497, 501, 506, 509, 513, 556, 563, 571, 580` -- placeholder + no-data strings, including a code comment literally referencing "em-dash"
- `src/pages/GrowthLabPage.jsx:40, 41, 63, 172, 186, 196, 208, 224` -- `|| '--'` fallbacks plus a `modelDisplayName` helper
- `src/components/orders/OrdersList.jsx:81, 663` -- placeholder cells in order rows
- `src/pages/OpsPage.jsx:377, 378, 454, 456, 459, 460` -- empty reorder cells
- `src/components/ops/PayoutConfigPanel.jsx:170` -- `"-- must total 100%"` validation blurb
- `src/pages/WallPage.jsx:209` -- `logisticsLine` fallback shows a bare em dash

Fix: replace with `--`, `None`, an empty string, or an `EmptyState` where
appropriate. Treat this as a single sweep PR.

### 2. Table headers not on the contrast pattern

PRs #88-#90 established `text-zinc-300 font-semibold uppercase tracking-wide
text-xs` for column headers. Several tables still use `text-zinc-500 font-normal`
or skip `font-semibold`.

- `src/components/people/PeopleDashboard.jsx:545`
- `src/pages/ContactsPage.jsx:378`
- `src/pages/CrmPage.jsx:1134-1146`
- `src/components/crm/CrmAccountsPipelineTable.jsx:93-101`
- `src/pages/OpsPage.jsx:348, 433`
- `src/pages/AnalyticsPage.jsx:437, 460, 518, 595, 610` (card-header `text-[10px] text-zinc-500` variant)
- `src/pages/GrowthLabPage.jsx:135, 145, 195, 199, 214` (section labels)

Fix: one-line class swap per header. Another clean sweep PR.

### 3. Empty / loading states bypassing `EmptyState` + `LoadingBlock`

Standing convention uses `src/components/shared/EmptyState.jsx`. Raw `<p>`
placeholders in:

- `src/pages/AnalyticsPage.jsx:405, 408, 523`
- `src/pages/GrowthLabPage.jsx:208`
- `src/pages/CrmPage.jsx:220-236` (DispatchTab inline empty)
- `src/pages/ContactsPage.jsx:589-593`
- `src/pages/WallPage.jsx:151-154` ("No completions in this range.")

### 4. Modal dialogs missing `aria-labelledby`

Repo convention (see Orders `notifyModal`) points `aria-labelledby` at the
`<h2>` id. Missing on:

- `src/components/orders/OrdersList.jsx:841-849` (cancel-order modal)
- `src/components/orders/OrdersList.jsx:908-915` (complete-order modal)
- `src/components/people/PermissionEditor.jsx` (UserEditorModal, ~L67-72)
- `src/pages/ContactsPage.jsx:482-487` (contact detail modal)

Fix: add `id="foo-title"` on the h2, add `aria-labelledby="foo-title"` on the
dialog wrapper.

### 5. Clickable `<tr>` rows with no keyboard affordance

- `src/pages/ContactsPage.jsx:450-454`
- `src/pages/CrmPage.jsx:1160-1164` (leads table)

Each needs `role="button"`, `tabIndex={0}`, and an Enter/Space keydown handler
-- or a structural refactor to a proper `<button>` inside the row. Same pattern
we fixed in PR #88 for kanban cards.

---

## Per-module findings

### Orders

**R** `src/components/orders/OrdersList.jsx:338-357` -- tires lookup `useEffect`
depends on the full `orders` array, so every snapshot refires `getDoc` for
every tire, producing N+1 reads on unrelated order mutations. Memoize a stable
mspn signature (`orders.map(o => o.mspn).join('|')`) and depend on that.

**R** `src/components/orders/OrdersList.jsx:449` -- `totalTouchpoints: 1 +
nextPoke` overwrites the counter. Use `increment(1)` like `pokeCount` above it.

**R** `src/components/orders/OrdersList.jsx:725-765` -- when `status ===
'in_transit'` and `customerNotifiedAt` is set, both "Mark complete" and "Send
update" render. The branches are not mutually exclusive. Fold into the ternary
at line 727.

**R** `src/components/orders/OrdersList.jsx:461` --
`setPaymentAmount(String(order.totalPrice ?? ''))` renders `"undefined"` if the
value is `undefined` (the nullish coalesce is correct; the risk is a stringified
`NaN` from older docs). Guard with `Number.isFinite`.

**R** `src/components/orders/OrdersList.jsx:653` -- `formatPercent(o.pricingAnomalyPct, 0)`
inside a `title` tooltip has no finiteness guard; renders `NaN%` on bad input.

**P** `src/components/orders/OrdersList.jsx:128-144, 146-162` -- hand-rolled
`fulfillmentBadgeClass` / `statusBadge` instead of the shared `StatusPill` +
`statusPillTone`. Replace.

**P** `src/components/orders/OrdersList.jsx:793, 851, 918` -- panels use
`MODAL_CENTER_PANEL_BASE` + ad-hoc `max-w-md` / `max-w-sm`. Either roll
`MODAL_CENTER_PANEL_SM` in `modalChrome.js` or use the canonical widths.

**A** `src/components/orders/OrdersList.jsx:716` -- emoji `⚠️` inside
`aria-label="Price discrepancy"` span will double-announce. Mark emoji
`aria-hidden` and put the label on the parent.

**A** Radio inputs at 247-252 and the "Payment received" checkbox at 923-930
lack explicit `id` + `htmlFor` pairing; implicit labels work but the rest of
the repo uses explicit.

### Analytics

**R** `src/pages/AnalyticsPage.jsx:127` -- `pokeOrders` query uses `where('pokeCount',
'>=', 1)` without `orderBy('pokeCount')`. Firestore requires the inequality
field as the first `orderBy`, or the query errors. Also uses `getDocs`, not
`onSnapshot`, so poke conversion never updates live.

**R** `src/pages/AnalyticsPage.jsx:162-181` -- MSPN batch loader fires N
individual `getDoc` calls on every `completedRows` change (up to 200 per
refetch). Anything past 200 MSPNs silently drops from `topSkus`,
`marginWeekSeries`, and the leaderboard.

**R** `src/pages/AnalyticsPage.jsx:113` -- initial `getDocs` (one-shot) for
4,000 completed orders means Analytics never reflects new completions until
remount. Convert to `onSnapshot` or explicit refresh.

**A** `src/pages/AnalyticsPage.jsx:441-443` -- decorative 🔥 emoji with `title`
only. Add `aria-label` or `aria-hidden` on the emoji and put the label on the
parent (value is already announced).

**A** `src/components/analytics/MarginWeekLineChart.jsx:77` -- chart has
`aria-label` but no text alternative; SVG `<title>` on circles isn't
keyboard-reachable. Add an sr-only list of week/percent pairs.

**A** `src/pages/AnalyticsPage.jsx:526, 551-582` -- leaderboard "titles" are
`<p>`, not `<h3>`. Breaks screen-reader landmark nav.

### GrowthLab

**D/R** `src/pages/GrowthLabPage.jsx:35, 123-125, 180-184` -- `confidence: 0.75`
is hardcoded, so the entire `confidencePct` UI always renders "75%". Surface
the real dispatcher confidence or drop the widget.

**D** `src/pages/GrowthLabPage.jsx:66-68` -- `copyText` is a one-line
passthrough to `copyToClipboard`; inline or drop.

**D** `src/pages/GrowthLabPage.jsx:75` -- `result.model` and `result.platform`
render the same string in adjacent slots (line 176 + line 41).

**A** `src/pages/GrowthLabPage.jsx:155-162` -- "Route task" button uses
`disabled:opacity-50` without `aria-busy={busy}`.

**A** `src/pages/GrowthLabPage.jsx:163` -- error `<p>` needs `role="alert"` /
`aria-live="assertive"`.

**A** `src/pages/GrowthLabPage.jsx:215-221` -- no `aria-live` feedback after
copy-to-clipboard.

### People (beyond Crew widget, which is intentionally here)

**R** `src/components/people/PeopleDashboard.jsx:178-197` -- `panelInviteUrl`
effect depends on `[selected]` (whole object). Narrow to
`[selected?.id, selected?.inviteToken]`.

**R** `src/components/people/PeopleDashboard.jsx:330` -- `inviteUrlFromToken`
fallback does `data.inviteUrl?.split('/i/').pop()`. If the URL has no `/i/`
segment, `pop()` returns the entire string. Defensive fallback is fragile.

**D** `src/components/people/UserRow.jsx:32` -- `const now = Date.now() + tick
* 0` -- the `tick * 0` arithmetic contributes nothing; only the prop changing
drives re-render. Rewrite as `void tick; const now = Date.now()`.

### CRM / Contacts

**R** `src/pages/CrmPage.jsx:319-336` -- `crmAccounts` swallows Firestore
errors into `setLoading(false)` without user feedback; `crmLeads` has no error
callback at all. Add onError + toast.

**R** `src/pages/CrmPage.jsx:338-344` -- `skedaddle-close-overlays` handler
closes `detail` but not `leadDetail` or `addAccountOpen`. Behavior diverges
from other pages.

**R** `src/pages/CrmPage.jsx:346-355` -- `queueMicrotask(() =>
setVehicles([]))` lets stale vehicles render under the new account for one
frame. Call `setVehicles([])` directly.

**P** `src/pages/CrmPage.jsx:934` -- `▾` / `▸` glyphs for accordion state on
mobile. Use the rotating chevron SVG the rest of the app uses.

**A** `src/pages/CrmPage.jsx:883-903` -- Lost column cards are `<button
draggable>`. Safari historically ignores `draggable` on buttons. Use
`<div role="button">`.

### VIP Concierge

**P** `src/pages/VipConciergePage.jsx:34` -- `catch {}` swallows verify errors
into `'invalid'` without logging. Add a `console.warn` for deploy debugging.

**A** `src/pages/VipConciergePage.jsx` -- `verifying` phase has no `<h1>` or
landmark heading. Users on a slow link hear nothing.

Otherwise clean.

### Wall

**R** `src/pages/WallPage.jsx:93-94` -- `new Date('${fromDate}T00:00:00')`
parses in local time, but `completedLabel` elsewhere uses Denver. At DST
boundaries the range filter drifts by up to a day.

**P** `src/pages/WallPage.jsx:151-154` -- empty state uses raw `<p>`; swap to
`EmptyState`.

**A** `src/pages/WallPage.jsx:164, 178, 183, 203` -- decorative emojis (🎩, 👉,
⏱) without `aria-hidden` or `role="img"` + label. The ✅ at 164 is already
hidden; extend to the others.

### Ops

**R** `src/pages/OpsPage.jsx:463-481` -- "Fulfilled" and "Dismiss" buttons both
call `removeReorderEntry(row.id)`. Dismiss should branch (status marker, audit
trail) or be removed.

**R** `src/pages/OpsPage.jsx:139` -- `getDoc(doc(db, 'tires', id))` assumes
MSPN = tire doc id. If that's not true, the catch renders the MSPN string as
the description silently.

**A** `src/pages/OpsPage.jsx` -- reorder action buttons (`Fulfilled` /
`Dismiss`) have no `aria-label` tying them to the MSPN row; SR users hear two
bare "Fulfilled" buttons.

**A** Table `<thead>` cells at 349-354, 434-439 lack `scope="col"`.

### Admin

**R (confirm with Alex)** -- **No audit-log component exists.** No
`src/components/admin/**` directory, and `AdminPage.jsx` never renders an
audit log. Either deferred intentionally or a genuine regression from spec.
Page is otherwise read-only and clean. No PII leaks, no em dashes.

### Handshake

**A** `src/pages/HandshakePage.jsx:82-98` -- the entire screen is one
`<button>` wrapping motion content, with a 4-second auto-advance timer (line
53). No `prefers-reduced-motion` handling, no Escape handler.

**A** `src/pages/HandshakePage.jsx:95` -- "Tap anywhere to continue" reads
wrong on desktop. The enclosing button has no `aria-label` -- SR users hear a
long paragraph inside a nameless button.

### My Queue

Does not exist. `grep -r 'MyQueue\|myQueue\|my-queue' src/` returns zero
matches; only the handoff doc at `docs/handoffs/patch-s-my-queue-page.md`
remains (and that one was already archived during the handoffs sweep). Confirm
whether this surface is still on the roadmap or can drop off.

### MechanicIntake

**P** `src/pages/MechanicIntakePage.jsx:538, 543` -- en-dashes in "10-25
miles" / "25-50 miles". The standing rule is em dash specifically, but en
dashes have been stripped elsewhere in recent PRs -- call it to flag.

**A** `src/pages/MechanicIntakePage.jsx:336-385, 938` -- "Next" at step 1 does
no client-side required-field validation; users can submit empty forms and the
server catches it. Add per-step validation.

**A** Radio group at 812-827 lacks `role="radiogroup"` / `aria-labelledby`.

**A** Progress bar at 317-322 has no `role="progressbar"` / `aria-valuenow`.

### Invite

**R** `src/pages/InvitePage.jsx:191` -- `signInWithEmailAndPassword(auth,
regEmail.trim(), regPassword)` uses the un-lowercased email, while line 184
sends `toLowerCase()` to the server. Mismatch on login when the stored record
is lowercased.

**R** `src/pages/InvitePage.jsx:241-271` -- `regStep === 5` branch in the
submit switch means a stray resubmit navigates to `/handshake` even if the
Slack invite was never clicked. Guard or unify the button.

**P** `src/pages/InvitePage.jsx:362-364` -- hardcoded name in "Ask Alex for
the Slack invite link". Pull from config / env.

**A** `src/pages/InvitePage.jsx:285-344` -- registration inputs on steps 0
(email), 1 (code), 3 (phone), 4 (password) have no label and no placeholder.
Hostile to screen readers.

**A** Modal has `role="dialog"` / `aria-modal` but no Escape handler.

**A** `src/pages/InvitePage.jsx:26-46` -- `playInviteTone()` and
`navigator.vibrate` fire without checking `prefers-reduced-motion`.

### Landing

Clean. Postlogin redirect whitelist blocks `//` and `..`. Branding `S` div is
decorative next to an `<h1>` so the missing `role="img"` is fine.

---

## Recommended execution order

Batch the cross-cutting sweeps first -- they remove the most noise for the
least effort and make the per-module PRs small enough to review at a glance.

1. **PR: em-dash sweep** (Cross-cutting #1). Pure find-and-replace across 7
   files, touches zero behavior.
2. **PR: table header contrast sweep** (Cross-cutting #2). One-line class
   swaps, 7 files.
3. **PR: empty / loading state sweep** (Cross-cutting #3). Swap raw `<p>` for
   shared components, 5 files.
4. **PR: modal a11y sweep** (Cross-cutting #4 + #5). `aria-labelledby` on 4
   dialogs, keyboard affordance on 2 `<tr>` rows.
5. **PR: Orders bug sweep**. The 3 real regressions (N+1 reads,
   `totalTouchpoints` overwrite, dual-button render).
6. **PR: Analytics data freshness**. Convert `getDocs` -> `onSnapshot`, fix
   `pokeCount` query, remove the 200-doc ceiling.
7. **Confirm with user:** Admin audit log (deferred? regression?) and My Queue
   (still on the roadmap? drop?).
8. **Per-module polish** (GrowthLab confidence dead-code, Wall DST, CRM error
   handlers, etc.) in a final cleanup PR.

Nothing on this list blocks shipping. Everything on it removes a paper cut.
