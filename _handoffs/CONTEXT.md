# Skedaddle Portal — Handoff Context

This file is used by `scripts/gen-next-handoff.js` to give Claude API the project context it needs to generate the next handoff. Do not delete this file.

---

## What Skedaddle Is

Mobile tire business in northern Colorado (Fort Collins / Greeley area). Just-in-time operation — no held inventory. Tires are sourced and delivered immediately when a customer orders. The portal is an internal ops tool used by Alex (owner), DJ (sales/field), and Kyle (fulfillment).

---

## Tech Stack

- **Frontend:** React 19 + Vite + Tailwind CSS, deployed to Vercel (auto-deploy from GitHub main)
- **Backend:** Firebase Gen2 Cloud Functions (Node 22), Firestore, Firebase Auth
- **Repo:** `abinghambyte/skedaddleinc` (GitHub), local at `C:\Users\Alex\Desktop\skedaddle-portal`
- **Functions:** `functions/index.js` exports all callables and scheduled jobs

---

## Key Conventions

- Dark theme throughout: zinc-950 background, zinc-800 borders, zinc-100 text
- Section titles: `text-xs font-medium uppercase tracking-wide text-zinc-500`
- Amber = warning/attention, emerald = good/active, red = critical
- Margin thresholds: red <15%, amber 15-29%, green 30-44%, emerald ≥45%
- All toast notifications via `useToast()` context — never `window.alert`
- Firestore writes from client use `updateDoc` / `addDoc` — no direct Admin SDK from browser
- `tireCatalogBuyNumber()` fallback chain: `price > 0` → `cost > 0` → `retailPrice`
- `timeAgo()` utility exists in `src/utils/timeAgo.js`
- `computeMargin()` in `src/utils/ctsCalc.js`
- Lint: `npm run lint`, Build: `npm run build` — both must pass before commit

---

## Actual File Structure

**Pages** (`src/pages/`):
`AnalyticsPage.jsx`, `ContactsPage.jsx`, `CrmDispatchPage.jsx`, `CrmPage.jsx`, `DashboardPage.jsx`, `GrowthLabPage.jsx`, `HandshakePage.jsx`, `InvitePage.jsx`, `LandingPage.jsx`, `MechanicIntakePage.jsx`, `OpsPage.jsx`, `OrdersPage.jsx`, `PeoplePage.jsx`, `TaskDispatcher.jsx`, `TiresPage.jsx`, `WallPage.jsx`

**Components** (`src/components/`):
- `analytics/MarginWeekLineChart.jsx`
- `crm/CrmAccountDetailPanel.jsx`, `crm/CrmAccountsPipelineTable.jsx`
- `dashboard/CreditTrackerCard.jsx`, `dashboard/Dashboard.jsx`, `dashboard/ProjectCard.jsx`
- `layout/CommandPalette.jsx`, `layout/MobileBottomNav.jsx`, `layout/ModuleSubheader.jsx`, `layout/PortalChrome.jsx`, `layout/PortalTopBar.jsx`
- `orders/OrdersList.jsx` ← **entire orders UI is in this one file** (no OrderCard, no OrderDetailPanel)
- `people/AvailabilityBlocker.jsx`, `people/PeopleDashboard.jsx`, `people/PermissionMatrix.jsx`
- `tires/FilterPresetsBar.jsx`, `tires/ListingGenerator.jsx`, `tires/MarginFilters.jsx`, `tires/MarginTable.jsx`, `tires/SaleMessenger.jsx`, `tires/TiresDashboard.jsx`
- `ui/ErrorBoundary.jsx`

**Hooks** (`src/hooks/`):
`useAuth.js`, `useDashboardSignals.js`, `useTires.js`, `useUserProfile.js`

**Key utils** (`src/utils/`):
`ctsCalc.js` (computeMargin), `crmPipeline.js`, `crmScore.js`, `exportMarginCsv.js`, `format.js`, `formatPhone.js`, `isoWeekDenver.js`, `listingStatus.js`, `orderPoolMargin.js`, `timeAgo.js`, `tireCatalogBuy.js`

**Important:** Do NOT assume file paths. If a component file doesn't appear in this list, it doesn't exist — check before referencing it.

---

## Modules

| Module | Route | Notes |
|--------|-------|-------|
| Dashboard | `/` | Live signal bar, activity feed, catalog health, crew zone |
| Tire Catalog | `/tires` | Virtual list, 10-col grid, listing tracker (FB/OU/CL) |
| Orders | `/orders` | Order status flow |
| CRM | `/crm` | Kanban pipeline, leads table, VIP accounts |
| CRM Dispatch | `/crm/dispatch` | Mechanic/admin job list |
| Analytics | `/analytics` | Wall, Revenue, Margin charts |
| People | `/people` | Crew management, invite flow |
| Ops | `/ops` | Expense tracker, tax export, reorder queue |
| Growth Lab | `/growth` | Internal AI routing tool |

---

## What Has Been Completed

### Phase 1 — Catalog Cleanup (Handoffs 01-03) ✅
- Removed eBay integration, Discord from SaleMessenger, Category column
- Removed price intel indicators (confidence dots, kyleConfirmed, flagged)
- Fixed $0.00 buy price bug (fallback chain now checks > 0)
- Removed Grade column and TireGradeModal
- Column widths, margin color thresholds, mobile always-on checkboxes
- Grid: 10 columns, minWidth 1068

### Phase 2 — Dashboard Refresh (Handoff 04) ✅
- Signal bar: Pending Orders, Needs Reposting, Catalog Size, Crew Alerts
- Recent activity (last 5 orders), Catalog health (missing overhead, below 15%)
- Crew zone with status color coding
- Module nav cards moved to bottom, hidden on mobile
- `useDashboardSignals` hook, `timeAgo` shared utility

### Phase 3 — Listing Management (Handoff 05) ✅
- Replaced dead stock concept with platform listing tracker
- `platformListings: { facebook, offerup, craigslist: { lastPostedAt } }` on tire docs
- Listed column in catalog: FB/OU/CL badges (emerald=active <7d, amber=stale, zinc=never)
- "Needs reposting" filter replaces "Dead stock only"
- "Mark as posted" buttons in ListingGenerator
- deadStockRadar job commented out in functions/index.js
- Firestore rules updated to allow `platformListings` writes

---

## Completed Handoffs

### Phase 4 — CRM Polish (Handoff 06) ✅
- Mobile tap-to-move stage (Set-based `mobileMoveOpen` state, `moveAccountStage()` function)
- Duplicate filter bar removed from leads tab
- `window.alert` → `toast` in `onDropStage` catch block
- Convert button responsive on mobile
- Dispatch empty state + mechanic "no jobs" variant

### Phase 5 — Analytics Accuracy (Handoff 07) ✅
- Hat trick label clarified to "Hat trick days (3-in-1)" with plain-English hint
- WTD/MTD: branch on null to show "Not yet updated for week X" instead of raw window key
- 4k cap: amber warning banner when `completedRows.length >= 4000` on metrics/revenue/leaderboard tabs
- DJ streak: "Personal best this session" + "All-time record (server)" labels

### Phase 6 — People Panel & Orders Polish (Handoffs 08–09) ✅
- `ContactsPage.jsx`: `addError` inline state, E.164 phone validation before using phone as doc ID, 3× `window.alert` → inline error + toast
- `OrdersList.jsx`: all 12 `window.alert` calls → `toast(..., 'error')`, prospective rows `opacity-60`

---

## Remaining Handoffs (ROADMAP phases)

### Handoff 10 — Ops Page QA (active)
5× `window.alert` → `toast()` in `src/pages/OpsPage.jsx` (addExpense, removeReorderEntry, runTaxExport), success toast on expense add, VITE_FUNCTIONS_REGION env var verification.

### Handoff 11 — Error Handling Pass
try-catch blocks → toasts, error boundaries on route components, loading spinners where missing, Firestore write failure toasts, large query limit warnings.

### Handoff 12 — Mobile Experience Audit
Catalog column proportions on small screens, CRM kanban (done in 06), people edit panel collapse, analytics chart readability, command palette mobile trigger, bottom nav permissions.

### Handoff 13 — Growth Lab Review
Task dispatcher routing accuracy (Opus/Sonnet/Haiku/Gemini criteria), session notes localStorage multi-tab behavior, Antigravity routing verification, copy prompt quality.

---

## Handoff Format Rules

- File saved to `_handoffs/XX-name.md`
- Starts with `# Handoff XX — Title`
- Second line: `**After completing all steps and verifying the checklist, run `node scripts/gen-next-handoff.js "[summary of what was done]"` then delete this file.**`
- Sections: Context, one Part per logical change area, Verification checklist
- Each Part targets a specific file with exact field/function/component names
- Verification checklist uses `- [ ]` items ending with lint and build checks
- Never vague — always specific file paths, exact prop names, exact field names
- Code snippets for non-obvious implementations
