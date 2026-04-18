# Handoff 11 — Alert Sweep
**After completing all steps and verifying the checklist, run `node scripts/gen-next-handoff.js "[brief summary]"` then delete this file.**

---

## Context

A global sweep of all remaining `window.alert` calls across the portal. Five files still use alerts. After this handoff every user-facing error and validation message goes through `toast()`. An `ErrorBoundary` wrap on the protected routes is also added so a JS crash in one module doesn't blank the whole app.

---

## Part 1 — `src/components/people/PeopleDashboard.jsx` (15 alerts)

This file has no `useToast` import yet.

**Step 1 — Add import** at the top of the file alongside the existing imports:
```js
import { useToast } from '../../context/ToastContext.jsx'
```

**Step 2 — Destructure inside the component.** `PeopleDashboard` renders via `export default function PeopleDashboard()` or similar — add near the top of the function body:
```js
const { toast } = useToast()
```

**Step 3 — Replace all 15 `window.alert` calls.** Rules:
- Error catches: `window.alert(e?.message || String(e))` → `toast(e?.message || 'Action failed.', 'error')`
- Validation guards that `return` early: `window.alert('message')` → `toast('message', 'error'); return`
- The one SUCCESS alert at line ~567 (`'Temporary elevation saved. It will revert automatically when it expires.'`) → `toast('Temporary elevation saved — will revert when it expires.', 'success')`
- The "not provisioned" alerts at lines ~483 and ~532 → `toast('This partner is not provisioned in the People system.', 'error')`
- The "Enter first name..." validation at line ~528 → `toast('Enter first name, last name, and email before preview.', 'error')`
- The "Choose module..." validation at line ~556 → `toast('Choose module, elevated level, and duration.', 'error')`

After replacing, search for `window.alert` in this file to confirm zero remain.

---

## Part 2 — `src/pages/ContactsPage.jsx` (4 alerts)

This file already imports `useToast` and has `const { toast } = useToast()`. Four `window.alert` calls remain in the contact detail / edit panel functions (not the add-contact form):

- **Line ~192** (`saveNotes` catch): `window.alert(e?.message || String(e))` → `toast(e?.message || 'Could not save notes.', 'error')`
- **Line ~202** (`saveDisplayName` validation): `window.alert('Name is required.')` → `toast('Name is required.', 'error'); return`
- **Line ~210** (`saveDisplayName` catch): `window.alert(e?.message || String(e))` → `toast(e?.message || 'Could not update name.', 'error')`
- **Line ~274** (one more catch further down the file): `window.alert(e?.message || String(e))` → `toast(e?.message || 'Action failed.', 'error')`

---

## Part 3 — `src/components/tires/TiresDashboard.jsx` (4 alerts)

This file uses `useToast` in the `notifySelectedQuick` function already. Add `toast` to the dependency arrays where needed.

Four calls, all in the bulk-action / prospective-order functions:

- **Line ~261** (missing MSPN): `window.alert('Selected tires are missing an MSPN.')` → `toast('Selected tires are missing an MSPN.', 'error')`
- **Line ~267** (mixed MSPNs): `window.alert('Selection includes multiple MSPNs. Using the first SKU...')` → `toast('Mixed MSPNs selected — using first SKU and matching rows only.', 'error')`
- **Line ~304** (no buy price): `window.alert('Selected tire needs a valid buy price...')` → `toast('Selected tire needs a valid buy price (Kyle catalog price).', 'error')`
- **Line ~325** (prospective order catch): `window.alert(e?.message || 'Could not create prospective order. Deploy functions?')` → `toast(e?.message || 'Could not create order — are functions deployed?', 'error')`

---

## Part 4 — `src/components/tires/MarginTable.jsx` (1 alert)

One alert in the overhead cost save catch (around line ~557):

```js
// Before:
window.alert(
  e instanceof Error ? e.message : 'Could not save overhead. Check Firestore rules.',
)
// After:
toast(e instanceof Error ? e.message : 'Could not save overhead. Check Firestore rules.', 'error')
```

Check how `toast` is obtained in this file — if `useToast` is not imported, add it (`import { useToast } from '../../context/ToastContext.jsx'`) and destructure `const { toast } = useToast()` inside the relevant component.

---

## Part 5 — `src/components/tires/BulkCtsModal.jsx` (1 alert)

One alert in the bulk save catch (around line ~63):

```js
// Before:
window.alert(
  e instanceof Error
    ? e.message
    : 'Bulk save failed. Check Firestore rules and your connection.',
)
// After:
toast(
  e instanceof Error ? e.message : 'Bulk save failed. Check Firestore rules and your connection.',
  'error',
)
```

Same pattern — check if `useToast` is already imported; add if missing.

---

## Part 6 — `src/components/tires/ListingGenerator.jsx` (1 alert)

One alert in the "mark as posted" timestamp update catch (around line ~275):

```js
// Before:
window.alert(e instanceof Error ? e.message : 'Could not update listing timestamp.')
// After:
toast(e instanceof Error ? e.message : 'Could not update listing timestamp.', 'error')
```

---

## Part 7 — Wire Up `ErrorBoundary` in `src/App.jsx`

The `ErrorBoundary` class component exists at `src/components/ui/ErrorBoundary.jsx` but is not used anywhere in `App.jsx`.

**Add import:**
```js
import { ErrorBoundary } from './components/ui/ErrorBoundary.jsx'
```

**Wrap the protected `<PortalChrome>` route group.** In `App.jsx` the route structure is:
```jsx
<Routes>
  <Route path="/" element={<LandingPage />} />
  <Route path="/i/:token" element={<InvitePage />} />
  <Route path="/intake/mechanic" element={<MechanicIntakePage />} />
  <Route element={<PortalChrome />}>   {/* ← wrap this */}
    ...protected routes...
  </Route>
</Routes>
```

Wrap only the `<PortalChrome>` route element:
```jsx
<Route element={<ErrorBoundary><PortalChrome /></ErrorBoundary>}>
```

Do NOT wrap `LandingPage`, `InvitePage`, or `MechanicIntakePage` — those are pre-auth and have their own simple layouts.

---

## Verification Checklist

- [ ] `grep -r "window.alert" src/` returns zero results
- [ ] `PeopleDashboard.jsx` imports `useToast` from `'../../context/ToastContext.jsx'`
- [ ] Saving a contact note shows a toast on error (not an alert)
- [ ] Bulk CTS save failure shows a toast (not an alert)
- [ ] `ErrorBoundary` is imported and wraps the `<PortalChrome>` route in `App.jsx`
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
