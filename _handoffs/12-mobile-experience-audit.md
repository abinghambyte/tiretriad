# Handoff 12 — Mobile Experience Audit
**After completing all steps and verifying the checklist, run `node scripts/gen-next-handoff.js "[brief summary]"` then delete this file.**

---

## Context

The alert sweep (Handoff 11) is done. Next up is a full mobile experience audit. Six areas need attention:

1. Catalog column proportions on small screens
2. People edit panel graceful collapse on mobile
3. Analytics chart readability on small screens
4. Command palette mobile trigger
5. Bottom nav permissions-gating verification
6. CRM kanban already handled in Handoff 06 — skip

Work entirely in existing files. No new files needed.

---

## Part 1 — Tire Catalog Mobile Column Proportions

**File:** `src/components/tires/MarginTable.jsx`

The virtual list renders a 10-column grid with `minWidth: 1068`. On phones, users must horizontal-scroll. That's acceptable, but the checkbox column and action columns must remain sticky/visible.

**Find** the outer scroll container (the `div` with `overflow-x-auto` or similar). Ensure it has `overflow-x-auto` and `-webkit-overflow-scrolling: touch`:

```jsx
// Outer scroll wrapper — confirm these classes are present, add if missing
<div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
```

**Find** the column definition array (look for `width` or `minWidth` values per column). Apply these exact widths if they differ:

| Column | Width |
|--------|-------|
| Checkbox | 36px |
| Brand | 110px |
| Size | 90px |
| Type | 72px |
| Buy | 64px |
| Overhead | 76px |
| Sell | 64px |
| Margin | 72px |
| Listed | 88px |
| Actions | 80px |

Total = 752px. Update `minWidth` on the grid container from whatever it currently is to `752`.

**Also** confirm the sticky checkbox column: the checkbox `th` and all `td` in the checkbox position must have `sticky left-0 z-10 bg-zinc-950` so it doesn't scroll away. Add these Tailwind classes if missing.

---

## Part 2 — People Edit Panel Mobile Collapse

**File:** `src/components/people/PeopleDashboard.jsx`

The edit panel is a wide modal/drawer. On mobile (`< 640px`) it likely renders full-width but may overflow or clip buttons in the footer.

**Find** the panel container (look for the div wrapping the edit form — likely has `w-96` or `max-w-lg` or similar fixed width). Add responsive classes:

```jsx
// Before (likely something like):
<div className="w-96 bg-zinc-900 ...">

// After:
<div className="w-full sm:w-96 bg-zinc-900 ...">
```

**Find** the footer row containing Ghost / Lock / Unlock / Delete / Save buttons. It likely uses `flex` with `gap`. On mobile these can overflow. Wrap them in two rows:

```jsx
<div className="flex flex-wrap gap-2 pt-4 border-t border-zinc-800">
  {/* destructive actions */}
  <div className="flex gap-2">
    {ghostButton}
    {lockOrUnlockButton}
    {deleteButton}
  </div>
  {/* save — pushed right on sm+ */}
  <div className="flex-1 flex justify-end">
    {saveButton}
  </div>
</div>
```

Apply this pattern to whatever the actual JSX looks like. Don't restructure logic — only restructure the layout wrapper divs and their className strings.

**Also** check `src/components/people/PermissionMatrix.jsx`. If it renders a table with 7 rows × N columns, ensure the table wrapper has `overflow-x-auto` so it doesn't force page-level horizontal scroll on narrow screens:

```jsx
<div className="overflow-x-auto">
  <table ...>
```

---

## Part 3 — Analytics Chart Readability on Small Screens

**File:** `src/components/analytics/MarginWeekLineChart.jsx`

Recharts `ResponsiveContainer` handles width automatically, but tick labels and margins need tuning for phones.

**Find** the `<XAxis>` component. Add `tick={{ fontSize: 11 }}` and `interval="preserveStartEnd"` if not already present:

```jsx
<XAxis
  dataKey="week"
  tick={{ fontSize: 11, fill: '#a1a1aa' }}
  interval="preserveStartEnd"
  tickLine={false}
/>
```

**Find** the `<YAxis>` component. Add `width={36}` to prevent the Y-axis from eating too much horizontal space on mobile:

```jsx
<YAxis
  width={36}
  tick={{ fontSize: 11, fill: '#a1a1aa' }}
  tickLine={false}
  axisLine={false}
  tickFormatter={(v) => `${v}%`}
/>
```

**Find** the `<CartesianGrid>` and confirm `strokeDasharray="3 3"` and `stroke="#27272a"` (zinc-800) — add if missing.

**Find** the `<ResponsiveContainer>`. Ensure it has a defined `minWidth` so it doesn't collapse to 0 on very narrow containers:

```jsx
<ResponsiveContainer width="100%" height={220} minWidth={280}>
```

---

## Part 4 — Command Palette Mobile Trigger

**File:** `src/layout/CommandPalette.jsx`

The palette currently opens on `Cmd+K` / `Ctrl+K`. On mobile there's no keyboard shortcut. Add a visible trigger button to `src/layout/PortalTopBar.jsx`.

**In `PortalTopBar.jsx`**, find the right side of the top bar (where user avatar or icons sit). Add a search/magnifier button that is visible only on mobile (`sm:hidden`):

```jsx
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

// Inside the top bar right section:
<button
  className="sm:hidden p-2 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
  onClick={() => setCommandOpen(true)}
  aria-label="Open command palette"
>
  <MagnifyingGlassIcon className="h-5 w-5" />
</button>
```

`setCommandOpen` must be wired from wherever the command palette open state lives. 

**Check how `CommandPalette` receives its open state.** It is either:
- (a) A context — in which case use the context's setter directly in `PortalTopBar`
- (b) A prop passed down through `PortalChrome` — in which case lift the state up one level if needed

**In `PortalChrome.jsx`**, if `commandOpen` state is local to `PortalChrome`, it's already passing `setCommandOpen` or an `onOpen` prop to `PortalTopBar`. If that prop doesn't exist yet, add it:

```jsx
// In PortalChrome.jsx — find existing commandOpen state, e.g.:
const [commandOpen, setCommandOpen] = useState(false);

// Pass to PortalTopBar:
<PortalTopBar ... onCommandOpen={() => setCommandOpen(true)} />

// In PortalTopBar.jsx — receive and use:
export default function PortalTopBar({ ..., onCommandOpen }) {
  ...
  <button ... onClick={onCommandOpen}>
```

Do not change the `Cmd+K` keyboard listener — it stays as-is. Only add the mobile button.

---

## Part 5 — Bottom Nav Permissions Verification

**File:** `src/layout/MobileBottomNav.jsx`

The bottom nav shows 5 tabs. Verify each tab is gated by the correct role.

**Find** the nav items array (likely an array of `{ label, icon, path, roles }` or similar). Confirm this exact gating:

| Tab | Allowed roles |
|-----|--------------|
| Dashboard | all |
| Orders | admin, sales, fulfillment |
| Tires | admin, sales, fulfillment |
| CRM | admin, sales |
| People | admin only |

**Find** where `useUserProfile` or `useAuth` is called in this file to get the current user's role. If the hook isn't imported yet, add it:

```jsx
import { useUserProfile } from '../../hooks/useUserProfile';

// Inside component:
const { profile } = useUserProfile();
const role = profile?.role ?? 'viewer';
```

**Find** the render of nav items. Add a filter if not already present:

```jsx
const visibleItems = NAV_ITEMS.filter(item =>
  !item.roles || item.roles.includes(role)
);
```

Then map over `visibleItems` instead of `NAV_ITEMS`.

If the file already has role filtering, read what's there and verify the role strings match exactly what's stored in Firestore user documents (`admin`, `sales`, `fulfillment`, `mechanic`, `viewer`) — correct any mismatches.

---

## Verification Checklist

- [ ] **Catalog:** Horizontal scroll works on a 390px-wide viewport (iPhone 14 size in DevTools); checkbox column stays pinned left
- [ ] **Catalog:** `minWidth` on grid container is `752` (or confirms total of all column widths)
- [ ] **People panel:** Edit panel renders full-width on mobile without horizontal overflow
- [ ] **People panel:** Footer buttons wrap to two rows on screens narrower than 400px; no buttons clipped
- [ ] **PermissionMatrix:** Table scrolls horizontally without causing page-level scroll
- [ ] **Analytics chart:** X-axis shows only first and last labels on narrow screens (`interval="preserveStartEnd"`)
- [ ] **Analytics chart:** Y-axis width is `36`, tick font size `11`
- [ ] **Command palette:** Magnifier button visible in top bar on mobile (`sm:hidden` means it shows below sm breakpoint)
- [ ] **Command palette:** Tapping magnifier opens palette; `Cmd+K` still works on desktop
- [ ] **Bottom nav:** Visiting as a `viewer` role hides Orders, Tires, CRM, People tabs
- [ ] **Bottom nav:** Visiting as `sales` role hides People tab, shows Orders/Tires/CRM
- [ ] **Bottom nav:** `admin` role sees all 5 tabs
- [ ] `npm run lint` — passes with no errors
- [ ] `npm run build` — passes with no errors