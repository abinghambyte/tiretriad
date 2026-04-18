# Handoff 13 — window.confirm Sweep

**After completing all steps and verifying the checklist, run `node scripts/gen-next-handoff.js "window.confirm sweep complete: all remaining calls replaced with inline two-click confirm patterns"` then delete this file.**

---

## Context

After Handoffs 11–12 (window.alert sweep + lockUser inline confirm), 6 `window.confirm` calls remain:

```
grep -rn "window.confirm" src/
```

Expected output before starting this handoff:
- `src/components/crm/CrmAccountDetailPanel.jsx:775`
- `src/components/people/PeopleDashboard.jsx:412` (applyRoleDefaults)
- `src/components/people/PeopleDashboard.jsx:591` (revokeInvite)
- `src/components/people/PeopleDashboard.jsx:620` (deleteUser)
- `src/pages/ContactsPage.jsx:268` (removeSelectedContact)
- `src/pages/TaskDispatcher.jsx:140` (clearHandoff)

The established pattern (see `lockUser()` in `PeopleDashboard.jsx` for reference): first click sets a pending state to `true` and returns early; button label changes to a confirm prompt; second click proceeds; closing the panel resets the state.

---

## Part 1 — PeopleDashboard.jsx (3 calls)

**File:** `src/components/people/PeopleDashboard.jsx`

### 1a. Add three new pending states

Near the `lockConfirmPending` state (around line 319), add:

```js
const [revokeConfirmPending, setRevokeConfirmPending] = useState(false)
const [deleteConfirmPending, setDeleteConfirmPending] = useState(false)
const [roleDefaultsPending, setRoleDefaultsPending] = useState(false)
```

### 1b. Reset all three in `openEditor` and `closeEditor`

`openEditor` (around line 350) — after `setLockConfirmPending(false)`, add:
```js
setRevokeConfirmPending(false)
setDeleteConfirmPending(false)
setRoleDefaultsPending(false)
```

`closeEditor` (around line 361) — after `setLockConfirmPending(false)`, add:
```js
setRevokeConfirmPending(false)
setDeleteConfirmPending(false)
setRoleDefaultsPending(false)
```

### 1c. Replace `window.confirm` in `applyRoleDefaults` (around line 409)

Replace:
```js
if (
  !window.confirm(
    'Changing role resets permissions to defaults for that role. Continue?',
  )
) {
  return
}
```

With:
```js
if (!roleDefaultsPending) {
  setRoleDefaultsPending(true)
  return
}
setRoleDefaultsPending(false)
```

Update the "Apply defaults" button label (around line 961):
```jsx
{roleDefaultsPending ? 'Confirm reset?' : 'Apply defaults'}
```

Also add `onClick` reset for when the user selects a different role without confirming — reset `roleDefaultsPending` in the role `<select>`'s `onChange`:
```jsx
onChange={(e) => { setRoleDraft(e.target.value); setRoleDefaultsPending(false) }}
```

### 1d. Replace `window.confirm` in `revokeInvite` (around line 589)

Replace:
```js
if (!window.confirm(`Revoke the invite for ${selected.firstName} ${selected.lastName}? They will not be able to use the current link.`)) return
```

With:
```js
if (!revokeConfirmPending) {
  setRevokeConfirmPending(true)
  return
}
setRevokeConfirmPending(false)
```

Update the Revoke button label (around line 917):
```jsx
{invokeBusy === 'revoke' ? 'Revoking…' : revokeConfirmPending ? 'Confirm revoke?' : 'Revoke'}
```

### 1e. Replace `window.confirm` in `deleteUser` (around line 616)

Replace:
```js
if (
  !window.confirm(
    `Permanently delete ${name}? This removes their account, invite tokens, and Firestore record. This cannot be undone.`,
  )
)
  return
```

With:
```js
if (!deleteConfirmPending) {
  setDeleteConfirmPending(true)
  return
}
setDeleteConfirmPending(false)
```

Update the Delete button label (around line 1145):
```jsx
{invokeBusy === 'delete' ? 'Deleting…' : deleteConfirmPending ? 'Confirm delete?' : 'Delete'}
```

---

## Part 2 — ContactsPage.jsx

**File:** `src/pages/ContactsPage.jsx`

`removeSelectedContact()` at line ~261 uses `window.confirm` before calling `deleteDoc`.

1. Find existing state declarations near the top of `ContactsPage` component. Add:
   ```js
   const [removeContactPending, setRemoveContactPending] = useState(false)
   ```

2. Find where `setSelected(null)` is called (in `removeSelectedContact` after a successful delete, and wherever the contact panel closes). Also add a reset when `selected` changes — simplest is to reset `removeContactPending` when `setSelected` is called with `null`. Add `setRemoveContactPending(false)` next to every `setSelected(null)` call.

3. Replace the `window.confirm` guard:
   ```js
   if (!window.confirm(msg)) return
   ```
   With:
   ```js
   if (!removeContactPending) {
     setRemoveContactPending(true)
     return
   }
   setRemoveContactPending(false)
   ```

4. Update the "Remove contact…" button label (around line 524):
   ```jsx
   {removeContactPending ? 'Confirm remove?' : 'Remove contact…'}
   ```

---

## Part 3 — CrmAccountDetailPanel.jsx

**File:** `src/components/crm/CrmAccountDetailPanel.jsx`

The Remove Vehicle button is at line ~775. The confirm is inline in the `onClick` handler inside a `.map()`. A pending ID approach is cleaner than a boolean here.

1. Find state declarations in `CrmAccountDetailPanel`. Add:
   ```js
   const [removeVehiclePendingId, setRemoveVehiclePendingId] = useState(null)
   ```

2. Replace the vehicle Remove button's `onClick`:
   ```jsx
   onClick={() => {
     if (!window.confirm('Remove vehicle?')) return
     void deleteDoc(doc(db, 'crmVehicles', v.id))
   }}
   ```
   With:
   ```jsx
   onClick={() => {
     if (removeVehiclePendingId !== v.id) {
       setRemoveVehiclePendingId(v.id)
       return
     }
     setRemoveVehiclePendingId(null)
     void deleteDoc(doc(db, 'crmVehicles', v.id))
   }}
   ```

3. Update the button label next to it:
   ```jsx
   {removeVehiclePendingId === v.id ? 'Confirm?' : 'Remove'}
   ```

---

## Part 4 — TaskDispatcher.jsx

**File:** `src/pages/TaskDispatcher.jsx`

`clearHandoff()` at line ~139 uses `window.confirm('Clear all four handoff fields?')`.

1. Add state:
   ```js
   const [clearPending, setClearPending] = useState(false)
   ```

2. Replace the `window.confirm` guard in `clearHandoff`:
   ```js
   if (!window.confirm('Clear all four handoff fields?')) return
   ```
   With:
   ```js
   if (!clearPending) {
     setClearPending(true)
     return
   }
   setClearPending(false)
   ```

3. Find the Clear button (the one that calls `clearHandoff`) and update its label:
   ```jsx
   {clearPending ? 'Confirm clear?' : 'Clear'}
   ```
   Also reset `clearPending` when any of the four handoff fields change:
   ```js
   // In the onChange/setter for decided, completed, outstanding, nextBrief:
   setClearPending(false)
   ```

---

## Verification Checklist

- [ ] `grep -rn "window.confirm" src/` returns no results
- [ ] `grep -rn "window.alert" src/` returns no results (confirm still clean from Handoff 11)
- [ ] `PeopleDashboard.jsx`: clicking "Apply defaults" once shows "Confirm reset?"; second click proceeds; changing role dropdown resets the label back to "Apply defaults"
- [ ] `PeopleDashboard.jsx`: clicking "Revoke" once shows "Confirm revoke?"; second click proceeds
- [ ] `PeopleDashboard.jsx`: clicking "Delete" once shows "Confirm delete?"; second click proceeds
- [ ] `PeopleDashboard.jsx`: opening a different crew member in the panel resets all pending states
- [ ] `ContactsPage.jsx`: clicking "Remove contact…" once shows "Confirm remove?"; second click proceeds; closing the panel resets to "Remove contact…"
- [ ] `CrmAccountDetailPanel.jsx`: clicking "Remove" on a vehicle shows "Confirm?" inline; clicking a different vehicle's Remove while one is pending resets to the new one
- [ ] `TaskDispatcher.jsx`: clicking Clear once shows "Confirm clear?"; second click clears all fields; editing any field resets the label
- [ ] `npm run lint` passes with no errors
- [ ] `npm run build` passes with no errors
