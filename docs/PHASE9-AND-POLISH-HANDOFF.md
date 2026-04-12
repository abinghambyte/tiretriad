# Phase 9 + UI Polish Handoff
> Drop this into Cursor as one session. Implements the Fleet CRM, UI polish, and UX improvements across the portal.
> Reference `docs/PHASE9-FLEET-CRM-HANDOFF.md` for full CRM data spec and `docs/SKEDADDLE-MASTER.md` for stack context.

---

## Part 1 — Fleet CRM (Phase 9)

### 1.1 Firestore schema, rules, indexes
Create collections: `crmAccounts`, `crmLeads`, `crmJobs`, `crmInventory` per `docs/PHASE9-FLEET-CRM-HANDOFF.md`.
Add `crm` module key to `ROLE_DEFAULTS` in `src/constants/peoplePermissions.js`:
```js
admin:    { ...existing, crm: 'manage' }
supplier: { ...existing, crm: 'none' }
mechanic: { ...existing, crm: 'none' }
viewer:   { ...existing, crm: 'none' }
```
Add composite indexes for `crmAccounts` on `pipelineStage + lastContactedAt` and `pipelineStage + createdAt`.

### 1.2 `crmAccountTrigger` Cloud Function
`onDocumentUpdated` on `crmAccounts/{id}`. **Fires on field update, not on save.**
- Pain score >= 7 (and was < 7 before) → Slack alert to `#fleet-ops`, add `hot` tag
- Stage moves to 3 → append auto-note "Pain confirmed — ready to offer pilot"
- Stage moves to 5 → create `crmJobs` stub, Slack alert "Trial scheduled — DJ notified"
- Follow-up date passed without stage change → Slack overdue alert
- Recalculate `score` on every update using 100-point formula from the CRM handoff doc

### 1.3 `crmStaleCheck` scheduled function
Daily at 8am MT (`0 14 * * *` UTC). Query `crmAccounts` where `lastContactedAt < 30 days ago` and `pipelineStage < 6` and `pipelineStage !== 7`. Post to `#fleet-ops` per stale account.

### 1.4 `/crm` — Kanban board
- 6 columns for stages 1–6, stage 7 collapsed as "Lost" count
- Account cards: company name, fleet size, score badge (0–39 gray / 40–59 yellow / 60–79 blue / 80–100 green), pain score, decision maker, last contacted
- Drag card between columns to advance `pipelineStage` — writes on drop
- Toolbar: Add account button, filter by segment/location/score, search by company name
- Protected route `module="crm" level="view"`

### 1.5 Account detail slide-in panel
- All `crmAccounts` fields editable inline
- Pain score: 1–10 slider — writes to Firestore on `onMouseUp` / `onTouchEnd`, not on a save button
- Vehicles tab: linked `crmVehicles` docs, add/edit/remove
- Notes timeline: append-only, each note has timestamp and author uid
- Follow-up date picker
- Score badge updates in real time as fields change (recalculate client-side, confirm with trigger)

### 1.6 Leads view
- Table: business name, source, segment, fleet size, urgency badge (Hot=red, Warm=amber, Cold=gray), follow-up date
- Add lead form
- "Convert to account" button per row — creates `crmAccounts` from lead data, sets `convertedToAccountId` on lead

### 1.7 `/crm/dispatch` — DJ-only job queue
- Cards: job type, location, vehicle count, tire sizes, scheduled time
- Buttons: Start job (sets `completionStatus: 'In Progress'`), Complete job (sets `completionStatus: 'Done'`, writes `completedAt`)
- DJ can update `completionStatus`, `actualTime`, `notes` only
- DJ cannot see `priceQuote`, `finalPrice`, or full account details
- Accessible to `mechanic` role and `admin`
- On complete: post to `#fleet-ops` "✅ Job complete — [location], [vehicleCount] vehicles"

### 1.8 Fleet CRM dashboard card
- Title: Fleet CRM
- Description: "Lead pipeline, fleet accounts, and DJ dispatch for northern Colorado tire operations."
- Status: LIVE
- Link: `/crm`
- Visible to users with `crm >= view`

---

## Part 2 — Invite URL Fix

In `PeopleDashboard.jsx`:
- The invite URL displayed after creating a user must use the token returned from the `createPortalUser` callable response — unique per user, format `https://www.skedaddleinc.com/i/[token]`
- Add the invite URL to the Edit side panel for existing users — query `inviteTokens` where `uid === user.uid` and `status === 'active'`, display with a copy button
- Never show the same URL for two different users

---

## Part 3 — Toolbar Reorganization

In `MarginTable.jsx` / `TiresDashboard.jsx`, when tires are selected show one unified toolbar:

Left group (primary actions):
- Generate listings
- Log sale — opens `SaleMessenger` pre-filled with MSPN + qty
- Notify team — sends immediate Slack ping to `#fleet-ops` with tire details (MSPN, description, qty) as availability alert, no customer fields, no order doc. Uses a new lightweight function `notifyTeamQuick` that posts Block Kit with tire info and an "Interested?" button linking to the portal
- Log prospective order

Right group (bulk actions, separated by divider):
- Clear selection
- Export CSV
- Bulk edit CTS

Remove the separate lower button row that currently shows these buttons. Remove "Log sale / notify team" from the Tires tool header — header should show only user email and Sign out.

---

## Part 4 — UI Polish

### Table cleanup
- Replace all "—" dash characters in empty Grade cells with truly empty cells
- Only show the margin strength badge (Strong/etc.) on rows where margin > 35%. Rows below 35% show just the percentage number, no badge

### Margin slider
- Change label from small-caps "MINIMUM MARGIN (0%)" to regular weight text "Min margin: 0%" with the percentage value larger and more prominent

### Filter bar
- Group Brand + Category together with a subtle divider between them and LR + Use Tag
- Move "Save current filters" button to the right end of the filter row, aligned with the dropdowns

### People portal action buttons
- Lock button: red tint (`color: var(--color-text-danger)`, `border-color: var(--color-border-danger)`)
- Ghost on: muted/gray style, low visual weight
- Edit: primary style, visually dominant
- History: icon button only (clock icon), no text label, small and unobtrusive

### Timed elevation badge
- Replace flame emoji with a clock or hourglass SVG icon — reads as time-limited, not streak

### Dashboard cards
- Cards with status "UNAVAILABLE" or "UNDER CONSTRUCTION": reduce opacity to 0.6 and desaturate accent color so live cards are visually dominant

### Selection indicator
- "N selected" count: wrap in a small colored badge (amber) so it's visually obvious when something is selected before action buttons appear

### Navigation
- Add subtle divider or increased spacing between "← Dashboard" back link and the Catalog/Orders tab labels in the Tires tool header

---

## Part 5 — UX Improvements

### Toast notification system
Create `src/components/ui/Toast.jsx` and a `useToast` hook. Brief, non-blocking notifications that appear bottom-right and auto-dismiss after 3 seconds. Use for: "CTS updated", "Invite sent", "Order cancelled", "Debrief saved", "Account moved to Stage N", "Job complete". Replace any silent modal closes with a toast confirmation.

### Confirmation dialogs for destructive actions
For Lock user, Cancel order, and any delete action: replace immediate execution with an inline confirm pattern — the button text changes to "Confirm / Cancel" on first click, executes on second click. No full modal needed — just a two-step button.

### Global search
Add a search input to the main header (visible on all portal pages). On type, search across:
- Tires: MSPN, description (client-side filter on cached data)
- Orders: customer name, MSPN (Firestore query)
- Contacts: name, phone (Firestore query)
- CRM accounts: company name (Firestore query)
Results appear in a dropdown under the input, grouped by type. Clicking a result navigates to the relevant page/record.

### Keyboard shortcuts
- `/` — focus global search input
- `Escape` — close any open modal, side panel, or dropdown
- `Enter` — confirm any single-action modal
- `Cmd/Ctrl + Enter` — submit forms
Add a small "?" icon in the footer or header that shows a keyboard shortcut reference on hover.

### Virtual scroll on tire table
Replace the current full-render tire table with a virtualized list. Use `react-window` (`npm install react-window`). Only render visible rows — fixes performance with 1,160+ rows. Maintain existing sort, filter, and checkbox selection behavior.

### Loading skeleton states
Add skeleton pulse rows to:
- Margin table (5 placeholder rows while `useTires` is loading)
- Orders list (3 placeholder rows)
- Contacts table (3 placeholder rows)
- CRM kanban (placeholder cards per column)
Simple CSS: `background: linear-gradient(90deg, var(--color-background-secondary) 25%, var(--color-background-tertiary) 50%, var(--color-background-secondary) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite;`

### Error boundary
Create `src/components/ui/ErrorBoundary.jsx` — React class component that catches unhandled errors. Shows: "Something went wrong" + error message in dev mode + "Reload page" button. Wrap `App.jsx` root and each major route component with it.

### Session timeout warning
In `src/hooks/useAuth.js` or a new `useSessionExpiry.js` hook: listen to Firebase Auth token expiry. When token is within 5 minutes of expiring, show a dismissible banner at the top of the page: "Your session expires soon — click to stay signed in." Clicking calls `currentUser.getIdToken(true)` to refresh. If expired before action, redirect to login with a "Session expired — please sign in again" message.

### Mobile responsiveness
- Margin table: horizontal scroll on mobile (`overflow-x: auto` wrapper), hide less critical columns (Grade, Category) on screens < 768px
- Kanban board: collapse to vertical stage list on mobile, each stage expandable
- Toolbar buttons: stack vertically on mobile when selection is active
- Orders list: card layout on mobile instead of table rows
- All modals: full-screen on mobile (`width: 100vw; height: 100vh; border-radius: 0`)
- DJ dispatch view: optimized for mobile — large touch targets on Start/Complete buttons (min 48px height)

### Dark/light mode toggle
Add a sun/moon icon toggle in the portal header. Stores preference in `localStorage` as `skedaddle-theme` (`dark` | `light`). Applies a `data-theme="light"` attribute to `document.documentElement`. Add a light theme CSS override in `index.css` that remaps the key CSS variables to lighter equivalents. Dark is default.

---

## Deploy sequence
```
npm run deploy:firebase   ← rules, indexes, functions
git add .
git commit -m "phase 9 CRM + portal polish + UX improvements"
git push
```

Check for new Firestore index prompts in the terminal output — create any composite indexes from the console link if prompted.

---

## Done When
- `/crm` kanban loads with 6 pipeline columns
- Pain score slider writes on release, triggers automation
- `/crm/dispatch` shows DJ only jobs, no pricing or account details
- Stale account check fires daily
- Invite URLs are unique per user and visible in the edit panel
- Toolbar is unified with Log sale and Notify team as separate buttons
- Toast notifications fire on all save/action confirmations
- Destructive actions require two-step confirmation
- Global search returns results across tires, orders, contacts, CRM
- Tire table uses virtual scroll
- Skeleton states show during data fetch
- Error boundary catches and displays unhandled errors
- Session expiry warning fires 5 minutes before token expires
- Portal is usable on mobile — DJ dispatch especially
- Dark/light mode toggle works and persists across sessions
