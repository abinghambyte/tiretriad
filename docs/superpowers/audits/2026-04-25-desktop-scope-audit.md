# Desktop scope audit — 2026-04-25

Auditor: Claude (Opus 4.7), single pass, ~30 min
Branch: desktop-scope-audit (off origin/main)
Method: route-map walk via src/App.jsx, then per-module read of pages, components, hooks, and supporting utils. Line counts and grep-driven dead-code checks.

## Executive summary

- Total modules audited: 11 (pages: 10 routed + 2 embedded; component dirs: 11)
- P0 (broken/blocking): 2 items
- P1 (clunky/incomplete): 13 items
- P2 (polish): 11 items
- P3 (dead code): 6 items

### Suggested top 5 priorities (cross-module)

1. **Fix `OpsPage` reorder-queue Fulfilled vs Dismiss bug** — both buttons call the same handler, so "Fulfilled" and "Dismiss" are indistinguishable in audit logs and behavior. (P0, S)
2. **Delete `src/components/dashboard/ProjectCard.jsx`** — fully orphan. The only references are itself + paired test (which only verifies the orphan). (P3, S)
3. **Collapse Analytics → Verification queue tab into a link** — it's a read-only mirror of `/my-queue`. The tab adds load (4000-row Firestore subscription on every Analytics visit) for zero net function. (P1, S)
4. **Refactor `MarginTable.jsx` (1275 lines) and `TiresDashboard.jsx` (1262 lines)** — these are now the two largest files in the codebase, both holding orchestration + presentation + sort/filter/edit logic. After the mobile-first split there is duplication between desktop grid rows and mobile horizontal cards inside one file. (P1, L)
5. **Decide the fate of the `CreditTrackerCard` on `/ops`** — it's rendered above every Ops tab but the `compact` flag is the only consumer. If it's not informative there, drop the surface; if it is, give Ops Command an "Overview" tab so the credit info has a home. (P2, S)

---

## Module: Dashboard (`/dashboard`)

### What it is
Single-page Today view: signals strip, ticker chips, Recent activity, and either NextToPostSurface (advisor mode) or HiddenGemsSurface (legacy). Routes via `DashboardPage.jsx` which is a one-line wrapper around `components/dashboard/Dashboard.jsx` (300 lines).

### Who uses it
Today: Alex (admin) lands here after login. Aspirational: Kyle/DJ would also start here.

### Routes / pages
- `/dashboard` — main Today view
- `/handshake` — first-time crew greeting redirect (consumed once, then `handshakeSeen=true`)

### Data model
- Firestore collections sampled by `useDashboardSignals`: `orders`, `tires`, `users`, `meta/revenueStats`, `meta/djStats` (legacy doc name; comment in AnalyticsPage explicitly notes "kept until a deliberate schema migration"), CRM accounts.

### Findings

#### P3 — Dead component: `ProjectCard.jsx`
File: `src/components/dashboard/ProjectCard.jsx`
What: Component is exported but never imported anywhere in `src/`. No test even references the export.
Why it matters: 164 lines of bit-rot. Likely a relic from an earlier dashboard iteration.
Effort: S

#### P1 — Two parallel "next thing to post" surfaces
Files: `src/components/dashboard/HiddenGemsSurface.jsx`, `src/components/dashboard/NextToPostSurface.jsx`
What: `Dashboard.jsx:287` swaps between `<NextToPostSurface>` and `<HiddenGemsSurface>` based on `flags.listingAdvisor`. Both compute and render the same conceptual surface.
Why it matters: Two divergent UIs for the same pane; if the flag is on for everyone, HiddenGemsSurface is dead. If not, both have to be maintained in lockstep.
Effort: S — flip the flag permanently and delete the loser.

#### P2 — `useDashboardSignals` returns `crewSignals` and `crew` but the dashboard never renders them
What: `Dashboard.jsx` does not import or use `<CrewDirectoryWidget>`. Only `PeopleDashboard` does. The hook's `crew/crewSignals` work is wasted on the dashboard render.
Effort: S

### Recommendation
Keep. Tighten by deleting `ProjectCard` and committing to one of NextToPostSurface vs HiddenGemsSurface.

---

## Module: Tires (`/tires`)

### What it is
The product-facing crown jewel. Tabbed shell with two tabs (`catalog`, `orders`) and 5 modal workflows: BulkCts, Haggle, Listing generator (with embedded Listing Advisor panel), Quote calculator, Sale messenger.

### Who uses it
Today: Alex. Aspirational: Kyle (sourcer, view-only orders), DJ (mechanic).

### Routes / pages
- `/tires` (catalog tab default)
- `/tires?tab=orders` — order workflow
- Highlight + filter deep-links: `?highlight=ID`, `?hiddenGems=true`, `?risk=lowMargin|missingOverhead`, `?needsReposting=1`, `?q=...`

### Data model
- `tires` collection (live snapshot via `useTires`)
- `orders` (consumed by embedded `OrdersList`)
- `meta/payoutConfig` (margin floor)
- `tires/{id}.platformListings.{facebook|offerup|craigslist}.lastPostedAt` + `status`
- `tires/{id}.researchQueue.{reason|by|resolvedAt|resolvedBy}` (verification queue link)

### Findings

#### P1 — `MarginTable.jsx` is 1275 lines
File: `src/components/tires/MarginTable.jsx`
What: Largest component file in the codebase. Holds: virtualized list (react-window), inline CTS editor, all column header tooltips, mobile horizontal cards (line 180-208), bulk-selection wiring, copy-to-clipboard helpers, listing status badges.
Why it matters: After mobile-first split there is now a desktop row variant AND a mobile horizontal card variant inside the same component. Cognitive load is high; tests only cover the mobile card piece.
Effort: L — extract MarginRowDesktop, MarginRowMobile, CtsInlineEditor.

#### P1 — `TiresDashboard.jsx` is 1262 lines
File: `src/components/tires/TiresDashboard.jsx`
What: Owns 14+ pieces of useState, sort/filter/select/persist/url-sync, 7 useEffects, plus modal mounting. Includes `selectHiddenGems` selector (lines 30-57) that probably belongs alongside `selectTopSellers` in a tires/selectors file.
Effort: L — extract selectors and modal-mount layer.

#### P1 — `ListingGenerator.jsx` is 712 lines
File: `src/components/tires/ListingGenerator.jsx`
What: Modal that builds platform-specific listing scripts, calls the `listingAdvisor` callable, and tracks per-platform mark-posted phases. Has its own `MarkPostedControl` subcomponent and an `unwrapListingAdvisor` helper duplicated near the bottom.
Effort: M — pull MarkPostedControl + advisor-result parser into siblings.

#### P2 — Listing Advisor split across 5 files
Files: `src/utils/listingAdvisor/{modeWeights,ranker,ranker.test}.js`, `src/components/tires/ListingAdvisorPanel.jsx`, `src/components/dashboard/NextToPostSurface.jsx`, `src/hooks/useAdvisorSignals.js`, `src/components/tires/ListingGenerator.jsx`
What: The advisor system has 3 callsites (Dashboard surface, Tires generator panel, hook) and a pure ranker — that's reasonable. But the per-tire callable invocation in ListingGenerator and the cohort ranker in `utils/listingAdvisor/ranker.js` are conceptually different things sharing a name. Not actually over-engineered — flag as worth a 5-min naming pass.
Effort: S

#### P2 — `flags.listingAdvisor` still gates code paths
What: Suggests the advisor isn't fully launched. Two surfaces gate on it; if it's on for prod, the gates are noise.
Effort: S

### Recommendation
Keep — it's the core product. Schedule the `MarginTable` + `TiresDashboard` split as a deliberate cleanup batch before adding new features.

---

## Module: Orders (`/orders`)

### What it is
Standalone Orders page that is explicitly a redirect target / secondary entry — the primary entry is `/tires?tab=orders`. The page itself just renders `<OrdersList>` with a banner explaining "primary entry: Skedaddle Tires → Orders."

### Who uses it
Today: Alex, when deep-linked from Dashboard activity feed (`/orders?highlight=ID`).

### Routes / pages
- `/orders?highlight=ID`

### Data model
- `orders` collection (live)
- `tires` lookup by mspn (via Firestore `in` queries, batched 30 at a time)

### Findings

#### P1 — Two homes for the same view
Files: `src/pages/OrdersPage.jsx`, `src/components/tires/TiresDashboard.jsx` (orders tab)
What: `<OrdersList>` is rendered both at `/orders` and at `/tires?tab=orders`. The `/orders` page exists mainly so the dashboard's recent-activity links and notification-side deep-links have a stable URL. Fine, but the "primary entry" banner is itself a smell.
Why it matters: New users / future docs may not know which to link to.
Effort: S — pick one canonical URL and 301 the other; or hide the banner.

#### P2 — `OrdersList.jsx` is 964 lines
File: `src/components/orders/OrdersList.jsx`
What: Owns the entire order workflow including poke messages, cancel dispositions, complete-order callable, sound effects, and a confirm-modal stack. Single component.
Effort: M — extract `<PokeModal>`, `<CancelModal>`, `<CompleteModal>`.

### Recommendation
Keep, but consolidate the entry. The standalone page is fine; the banner is unnecessary.

---

## Module: People (`/people`)

### What it is
Two tabs in one page: Crew (PeopleDashboard) and Customers (ContactsPage embedded). Crew tab manages user invites, permissions, NFC writes, availability blockers, and a Crew Directory widget.

### Who uses it
Today: Alex (admin, 'manage' permission required).

### Routes / pages
- `/people` (crew tab default)
- `/people?tab=customers`
- `/contacts` → redirects to `/people?tab=customers` (legacy)

### Data model
- `users` collection
- `contacts` collection (up to 2000)
- `ghostContacts/{phoneId}.ghostCount`
- `orders` queried by `contactPhoneKey` for per-customer history

### Findings

#### P1 — `PeopleDashboard.jsx` is 737 lines
File: `src/components/people/PeopleDashboard.jsx`
What: 30+ pieces of useState. Owns invite create flow, NFC, elevation scheduling, permission editor mount, lock/revoke/delete confirmations, role-defaults edit, AvailabilityBlocker, history modal. Crew Directory is rendered inline.
Effort: L — split into PeopleHeader, InviteWidget, UsersTable.

#### P1 — `ContactsPage.jsx` is 666 lines
File: `src/pages/ContactsPage.jsx`
What: Embedded under `/people?tab=customers`, also has a legacy `/contacts` redirect. Sort + filter + add + remove + edit notes + edit name + ghost count + per-customer order history all in one component.
Effort: M

#### P2 — `InviteUrlToolkit.jsx` exports 4+ things
File: `src/components/people/InviteUrlToolkit.jsx` (513 lines)
What: Exports `CreateUserInviteSection`, `InvitePreviewModal`, `inviteUrlFromToken`, `isTannerPortalBlocked`. The "Tanner-portal-blocked" check is a feature-specific carve-out; worth verifying it's still needed.
Effort: S — verify Tanner check still applies in 2026.

#### P3 — `AvailabilityBlocker.jsx` may be aspirational
File: `src/components/people/AvailabilityBlocker.jsx` (456 lines)
What: Only consumer is `PermissionEditor.jsx`. If no other crew is using the system today (and per the task brief Kyle/DJ aren't yet), this 456-line UI is solving an aspirational problem.
Effort: S — defer or document.

### Recommendation
Keep, but the Crew tab is overweight for a single-user system. Consider hiding sub-features behind feature flags until Kyle/DJ actually onboard.

---

## Module: CRM (`/crm`)

### What it is
Rubber CRM — pipeline kanban board, Leads list, Field Dispatch (mechanic-only). 1260-line page with 3 tabs.

### Who uses it
Today: Alex (manage). Aspirational: DJ (mechanic) for Field Dispatch.

### Routes / pages
- `/crm` (board)
- `/crm?tab=leads`
- `/crm?tab=dispatch` (mechanic + admin)
- `/crm/dispatch` → 301 to tab variant

### Data model
- `crmAccounts` collection (kanban stages 1-5 + 'lost')
- `crmLeads` collection
- Inferred from `utils/crmPipeline.js`: stage labels, last-activity entry, estimated deal value

### Findings

#### P1 — `CrmPage.jsx` is 1260 lines
File: `src/pages/CrmPage.jsx`
What: Houses Board kanban + Leads table + DispatchTab + Add Account flow + Lost-deals ribbon + score filters + segment filter + location filter + free text search. Uses `InputPromptModal` for "Add VIP client" stage 1.
Effort: L — split into 3 tab subcomponents and an addAccount flow file.

#### P1 — `CrmAccountDetailPanel.jsx` is 918 lines
File: `src/components/crm/CrmAccountDetailPanel.jsx`
What: Side-panel for editing a single account: contacts, notes, deal value, next action, stage moves, activity log. Single-component complexity.
Effort: L

#### P2 — Field Dispatch tab renders for admin even when no crew exists
File: `src/utils/crmModuleTabs.js:21`
What: `canDispatch = profile?.role === 'mechanic' || profile?.role === 'admin'`. Today there is no mechanic. Tab functions but always shows zero jobs.
Effort: S — gate behind a feature flag or hide when no mechanic users exist.

### Recommendation
Keep — CRM is actively used. Schedule the page split as part of the same refactor batch as MarginTable / TiresDashboard.

---

## Module: Analytics (`/analytics`)

### What it is
6-tab page (4 base + 2 admin): Wall, Metrics, Revenue, Leaderboard, Verification queue (admin), Margin archive (admin).

### Who uses it
Today: Alex.

### Routes / pages
- `/analytics` (wall default)
- `/analytics?tab=metrics`
- `/analytics?tab=revenue`
- `/analytics?tab=leaderboard`
- `/analytics?tab=verification-queue` (admin)
- `/analytics?tab=margin-archive` (admin)
- `/wall` → 301 to `/analytics?tab=wall`

### Data model
- `orders` (limit 4000, completed only — `SampleCapBanner` warns when capped)
- `meta/revenueStats` — `weeklyWindow`, `monthlyWindow`, `weeklyRevenue`, `monthlyRevenue`, `allTimeRevenue`, `topSellers`, `dailyHistory`
- `meta/djStats` (legacy doc name preserved per code comment)
- `tires` (for archive + margin lookup)

### Findings

#### P1 — `verification-queue` tab is a read-only mirror of `/my-queue`
File: `src/pages/AnalyticsPage.jsx:633`
What: The tab description literally reads "Live view of pending verification items. Resolve from /my-queue." It then renders `<VerificationOversightList rows={...} readOnly />`. So it's a read-only second instance of MyQueuePage's data.
Why it matters: Cognitive load (which tab do I click to "look at the queue?"). Also costs an extra `useTires()` subscription on every Analytics visit.
Effort: S — collapse into a banner link "View pending queue ({n}) →".

#### P1 — `AnalyticsPage.jsx` is 856 lines
What: Covers all 6 tabs in one file. Wall is delegated to `<WallPage embedded />` (good), but Metrics/Revenue/Leaderboard/Verification/Archive are inline.
Effort: M — extract per-tab subcomponents.

#### P2 — Subscribes 4000 completed orders + 800 poked orders + 2 meta docs on every Analytics visit
What: Even when a user only wants the Wall, they pay the cost of all subscriptions because they're at top-level useEffects.
Effort: M — gate subscriptions on the active tab.

#### P3 — `meta/djStats` legacy doc name
What: Code comment at `AnalyticsPage.jsx:124` flags this. Worth tracking as a known migration debt.
Effort: M — rename + backfill.

### Recommendation
Keep, but trim. The admin-only tabs are duplicative; the verification tab in particular is begging to be deleted.

---

## Module: Ops Command (`/ops`)

### What it is
Admin-only operational tools: expense tracker (CSV-bound), tax-prep export, payouts config, reorder queue. Plus a top-of-page CreditTrackerCard rendered above every tab.

### Who uses it
Today: Alex (admin only — `Navigate to="/dashboard?notice=access"` for non-admins).

### Routes / pages
- `/ops` (expenses default)
- `/ops?tab=tax-prep`
- `/ops?tab=payouts`
- `/ops?tab=reorder`

### Data model
- `expenses` collection
- `meta/reorderQueue.entries[]`
- `meta/payoutConfig` (via `usePayoutConfig`)

### Findings

#### P0 — Reorder queue: Fulfilled and Dismiss buttons do the same thing
File: `src/pages/OpsPage.jsx:493-509`
What: Both `<button>` elements call `removeReorderEntry(row.id)` with no other distinction. Visually they look different (emerald vs zinc) but behaviorally identical — neither writes a "fulfilled" or "dismissed" marker, both just delete the entry.
Why it matters: Audit trail loss. The Sourcer can't tell why something was removed. Also misleading UX.
Effort: S — add an `outcome` arg ('fulfilled' | 'dismissed'), append to a history field on `meta/reorderQueue` instead of just dropping.

#### P2 — `CreditTrackerCard` is rendered at the top of every Ops tab
File: `src/pages/OpsPage.jsx:283`
What: The card uses `compact` prop. If it's important enough to render on every Ops tab, it should be its own tab. If not, it's noise.
Effort: S

#### P2 — `OpsPage.jsx` is 535 lines for a 4-tab page
What: Each tab is moderately complex but there's no extraction. Inline CSV download helper, inline date formatters, etc.
Effort: M

### Recommendation
Keep. Fix the P0 button bug first.

---

## Module: Admin (`/admin`)

### What it is
Tiny admin-only page: trigger price-research callable, show inbound SMS webhook URL, render `AuditLogPanel`.

### Who uses it
Today: Alex.

### Routes / pages
- `/admin`

### Data model
- Reads `auditLog` via `AuditLogPanel`
- Calls `runTirePriceResearchNow` callable

### Findings

#### P2 — Page is a grab-bag of unrelated admin actions
What: Price research, SMS webhook, audit log all in one page with no taxonomy. This is fine while small but will get worse if more admin tools land here.
Effort: S — pre-emptively add tabs (`integrations`, `jobs`, `audit`).

#### P2 — `AuditLogPanel.jsx` is the only file in `src/components/admin/`
What: A single-file "module." Either move it inline to AdminPage or accept the directory and add the panel above to `src/components/admin/`.
Effort: S

### Recommendation
Keep, but reorganize before piling more admin tools onto it.

---

## Module: My Queue (`/my-queue`)

### What it is
Sourcer + admin verification queue. Renders one `<QueueRow>` per pending tire. Resolve outcomes: `retail-wrong`, `confirm-archive`, `punt`.

### Who uses it
Today: Alex (admin). Aspirational: Kyle (sourcer).

### Routes / pages
- `/my-queue` (no tabs)

### Data model
- `tires` filtered by `selectOpenQueueRows` (tires where `researchQueue.status === 'open'` or similar — see `utils/queueSelectors.js`)

### Findings

#### P2 — Same data shown read-only at `/analytics?tab=verification-queue`
What: See Analytics findings. The duplication originates here.
Effort: S — covered by collapsing the Analytics tab.

### Recommendation
Keep. This page is well-scoped and tested.

---

## Module: Growth Lab (`/growth`)

### What it is
Admin-only "task dispatcher" UI that calls the `taskDispatcher` callable to route tasks across Claude Opus / Sonnet / Haiku / Gemini / Antigravity.

### Who uses it
Today: Alex only. There is no nav link to it — only the command palette includes it (`paletteActions.js:93`).

### Routes / pages
- `/growth`

### Data model
- No Firestore reads/writes
- `localStorage["sk-dispatch-notes"]` — session notes persist locally

### Findings

#### P1 — Hidden from nav
File: `src/components/layout/DesktopTopNav.jsx`
What: GrowthLab is admin-only and intentionally not in DesktopTopNav. It's only reachable via Cmd+K. The subtitle says "Internal tools and experiments. Overwatch only." — that's a hint that this is meta-tooling for Alex.
Why it matters: If it's actually useful, it should at least be in the admin nav. If it's experimental, mark it as such.
Effort: S — add to nav under a "Lab" or "Tools" label, or remove and make it a CLI script.

#### P3 — Probably dead-ish
What: The whole concept (dispatch a task to a Claude variant) is more useful as a CLI / Cursor tool than a portal page. Unless Alex actually uses this regularly, it's a UI for something that should not be a UI.
Effort: S — verify with Alex; remove if unused.

### Recommendation
Brainstorm. This may be vestigial.

---

## Module: Layout & Navigation (`src/components/layout/`)

### What it is
PortalChrome (top-level layout w/ session expiry + theme toggle), PortalTopBar (logo + module title + palette open + sign out), DesktopTopNav (primary nav strip), MobileBottomNav (sm and below), CommandPalette, ModuleSubheader.

### Findings

#### P2 — Theme toggle exists despite "dark-mode only" platform claim
File: `src/components/layout/PortalChrome.jsx:14-38, 102-127`
What: Full light-mode plumbing: `THEME_KEY`, `applyTheme`, `resolveInitialTheme` with `prefers-color-scheme: light` detection, persistent toggle. The brief says "dark-mode only."
Why it matters: Either light mode actually works (in which case audit it) or it doesn't (in which case this is shipped tech-debt).
Effort: M — pick one direction.

#### P2 — `// TODO: add Settings link here once a /settings route exists in src/App.jsx`
File: `src/components/layout/PortalTopBar.jsx:130`
What: The only TODO in the codebase; placeholder for a settings route that has never landed.
Effort: S — either implement /settings or delete the TODO.

#### P2 — `PortalSessionLine.jsx` is a 27-line file
What: Trivially small extraction. Inlining it would likely improve readability of the 2-3 callsites.
Effort: S

#### P2 — `MobileBottomNav` reads `localStorage.getItem('skedaddle.mobile.fullPortal')` for "fullMode"
What: Hidden feature flag with no UI to toggle it. If Alex doesn't use it, it's dead. If experimental, document it.
Effort: S

### Recommendation
Keep but tighten. Decide on light mode and settings page.

---

## Module: Shared / UI primitives (`src/components/ui`, `src/components/shared`)

### What it is
Cross-module primitives: BrandBolt (logo SVG), Popover, Spinner, ErrorBoundary, StatusPill, SampleCapBanner, EmptyState, LoadingBlock, InputPromptModal, modalChrome.js, buttonStyles.js, statusPillTone.js.

### Findings

#### P2 — `modalChrome.js` and `buttonStyles.js` constants are not consistently used
What: Files like `OpsPage.jsx`, `CrmPage.jsx` re-declare button classes inline (`bg-amber-500 px-3 py-2 ...`) instead of using `BTN_PRIMARY` / `BTN_SECONDARY`. Some files import them; others don't.
Effort: M — codemod inline button class strings to constants.

#### P2 — `BrandBolt` has at least 3 tone variants (`muted`, `glow`, default). Worth confirming all are used.
Effort: S

### Recommendation
Keep. These primitives are healthy; the inconsistency is in callsites, not the primitives themselves.

---

## Module: Queue (`src/components/queue/`)

Single file: `QueueRow.jsx` (used by both `/my-queue` and the Analytics verification-queue tab). Tested. No findings.

### Recommendation
Keep.

---

## Module: Analytics components (`src/components/analytics/`)

Single file: `MarginWeekLineChart.jsx`. Used only by `/analytics?tab=revenue`.

### Findings

#### P3 — Single-file "module"
What: This directory exists for one chart. Either move the file inline or accept that an `analytics/` folder is correct. Minor.
Effort: S

### Recommendation
Keep as-is.

---

## Module: Milestones (`src/components/milestones/`)

Single file: `OrderCompletionMilestones.jsx`. Mounted globally by PortalChrome. Likely fires confetti / toasts on completed orders.

### Findings

#### P3 — Single-file "module"
What: Same observation as analytics dir.
Effort: S

### Recommendation
Keep.

---

## Module: Chat (`src/components/chat/`)

Single file: `SinchChatMount.jsx`. Likely the inbound SMS surface.

### Findings

#### P3 — Single-file "module" — verify it's actually mounted
What: Need to confirm a parent renders this. If unmounted, it's dead.
Effort: S — grep usage.

### Recommendation
Verify; otherwise keep.

---

## Cross-cutting themes

### 1. "Single-file module" pattern
Five component dirs (`admin/`, `analytics/`, `chat/`, `milestones/`, `queue/`) each contain a single non-test file. Three options:
- Inline them into their primary callsite (queue is the exception — it has 2 callsites)
- Accept the dirs and keep adding to them
- Establish a rule: dirs only when ≥2 sibling files

### 2. Fat orchestrator components
The five biggest non-trivial files in `src/`:
- `MarginTable.jsx` — 1275
- `TiresDashboard.jsx` — 1262
- `CrmPage.jsx` — 1260
- `OrdersList.jsx` — 964
- `MechanicIntakePage.jsx` — 957
- `CrmAccountDetailPanel.jsx` — 918
- `AnalyticsPage.jsx` — 856
- `PeopleDashboard.jsx` — 737

Pattern: each module has a god-component that owns state, effects, tab routing, and presentation. The mobile-first overhaul (PRs #130-149) added mobile-specific JSX *inside* these same files, which made several of them larger rather than splitting them. This is the single biggest refactor opportunity in the codebase.

### 3. Multiple "queue mirrors"
The verification queue exists at `/my-queue` and at `/analytics?tab=verification-queue`. The orders list at `/orders` and `/tires?tab=orders`. The contacts list at `/people?tab=customers` and `/contacts` (redirect, so OK). Each mirror means double-subscription overhead and double cognitive load.

### 4. Aspirational features lying in wait
The codebase carries scaffolding for features that aren't actively used:
- `AvailabilityBlocker.jsx` (456 lines) — schedules crew time-off, but only Alex is on the system
- `Field Dispatch` tab — needs a mechanic user to be useful
- `CrewDirectoryWidget` — "online presence" only meaningful with multiple users
- `/growth` — task dispatcher hidden from nav

None of this is wrong (the system is being designed for Kyle + DJ), but as a single-user-today reality, it's worth knowing what could be flag-gated until those users actually onboard.

### 5. Inline button styling vs `buttonStyles.js`
`BTN_PRIMARY` / `BTN_SECONDARY` / `BTN_GHOST_DESTRUCTIVE` exist but at least half the buttons in pages re-declare the same Tailwind. A single codemod pass would tighten this.

### 6. Theme system in a "dark-mode only" app
Light-mode plumbing is fully wired. Either embrace it or strip it; right now it's non-zero maintenance cost for an unused capability.

### 7. Two listing surfaces gated by `flags.listingAdvisor`
HiddenGemsSurface vs NextToPostSurface. Probably the flag should flip permanently and the loser should be deleted.

---

## Suggested first wave

Top items ranked by impact / effort. Format mirrors the Batch 6/7 handoff briefs.

```yaml
- id: ops-fulfilled-vs-dismiss-fix
  title: "ops: distinguish Fulfilled vs Dismiss in reorder queue"
  branch: claude/ops-reorder-fulfilled-dismiss
  scope: |
    src/pages/OpsPage.jsx — split removeReorderEntry into two handlers,
    write a 'fulfilledHistory' or 'dismissedHistory' array on
    meta/reorderQueue. Tests for each path.
  depends_on: []
  effort: S
  priority: P0

- id: dashboard-projectcard-cleanup
  title: "dashboard: delete dead ProjectCard"
  branch: claude/dashboard-delete-projectcard
  scope: |
    Remove src/components/dashboard/ProjectCard.jsx and its test (the test
    only verifies the orphan compiles).
  depends_on: []
  effort: S
  priority: P3

- id: analytics-collapse-verification-queue-tab
  title: "analytics: collapse verification-queue tab into a banner link"
  branch: claude/analytics-drop-verification-tab
  scope: |
    src/pages/AnalyticsPage.jsx — remove 'verification-queue' from
    ADMIN_TAB_IDS, replace inline rendering with a one-line "View pending
    queue (N) →" link to /my-queue. Update palette actions if needed.
  depends_on: []
  effort: S
  priority: P1

- id: dashboard-pick-listing-surface
  title: "dashboard: commit to one listing surface (advisor or hidden gems)"
  branch: claude/dashboard-one-listing-surface
  scope: |
    Decide flags.listingAdvisor outcome. Delete the loser
    (HiddenGemsSurface or NextToPostSurface) and remove the flag check
    from Dashboard.jsx. Update tests.
  depends_on: []
  effort: S
  priority: P1

- id: tires-margintable-extract
  title: "tires: extract MarginTable into row + editor + table-shell"
  branch: claude/tires-margintable-split
  scope: |
    src/components/tires/MarginTable.jsx — split into
    MarginRowDesktop.jsx, MarginRowMobile.jsx, CtsInlineEditor.jsx,
    MarginTable.jsx (shell + virtualization). Preserve existing tests;
    add coverage for the editor.
  depends_on: []
  effort: L
  priority: P1

- id: tires-tiresdashboard-extract-selectors
  title: "tires: pull selectors out of TiresDashboard"
  branch: claude/tires-extract-selectors
  scope: |
    Move selectHiddenGems and any other selectors from
    TiresDashboard.jsx into src/utils/tireSelectors.js. Update imports
    + tests.
  depends_on: []
  effort: M
  priority: P1

- id: layout-decide-light-mode
  title: "layout: decide light mode (ship or strip)"
  branch: claude/layout-light-mode-decision
  scope: |
    Either: (a) audit light mode for parity and ship it; or (b) remove
    THEME_KEY plumbing, ThemeToggle, command-palette toggle action, and
    keep dark-only.
  depends_on: []
  effort: M
  priority: P2

- id: ops-credittracker-placement
  title: "ops: pick a home for CreditTrackerCard"
  branch: claude/ops-credit-tracker-placement
  scope: |
    Either move CreditTrackerCard into its own /ops?tab=credit tab, or
    drop it from the Ops shell. Currently it renders above every tab
    which dilutes both it and the active tab.
  depends_on: []
  effort: S
  priority: P2

- id: people-tanner-flag-audit
  title: "people: verify isTannerPortalBlocked still applies"
  branch: claude/people-tanner-flag-audit
  scope: |
    src/components/people/InviteUrlToolkit.jsx — confirm with Alex that
    the Tanner-portal block is still desired in 2026; remove if not.
  depends_on: []
  effort: S
  priority: P2

- id: growth-lab-decision
  title: "growth: decide if /growth route stays"
  branch: claude/growth-lab-decision
  scope: |
    Confirm with Alex whether the task-dispatcher UI is used. If yes,
    add a nav entry. If no, delete the route + page + paletteActions
    entry.
  depends_on: []
  effort: S
  priority: P3
```

---

End of audit.
