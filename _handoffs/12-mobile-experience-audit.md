# Handoff 12 — Mobile Experience Audit
**After completing all steps and verifying the checklist, run `node scripts/gen-next-handoff.js "[brief summary]"` then delete this file.**

---

## Context

Mobile audit of the portal. Most items are already handled — the edit panel is `w-full`, PermissionMatrix uses `div` rows with `flex-wrap`, the margin chart is a custom SVG with `viewBox`, the search button in PortalTopBar is always-visible, and MobileBottomNav already gates by `permissionMeets`. Two real gaps remain: the catalog table minWidth and a `window.confirm` left in PeopleDashboard.

---

## Part 1 — Tire Catalog: Reduce `minWidth` for Mobile Scrollability

**File:** `src/components/tires/MarginTable.jsx`

**Find** the style object at roughly line 59:
```js
minWidth: 1068,
gridTemplateColumns: '52px 7rem 2fr 5.5rem 3rem 6rem 7rem 5rem 6rem 6rem',
```

The `2fr` column gets whatever space is left. On a 390px phone this means scrolling ~680px — too much. Tighten the fixed columns so the total natural width is ~820px:

```js
minWidth: 820,
gridTemplateColumns: '40px 6rem 2fr 5rem 3rem 5rem 6rem 4.5rem 5.5rem 5.5rem',
```

The sticky left column (the checkbox `div` at the `sticky left-0 z-[15]` position) is already correctly sticky — no changes needed there.

Spot-check: load the catalog in Chrome DevTools at 390px wide. Confirm horizontal scroll works, the checkbox column stays pinned left, and no column text overflows its cell.

---

## Part 2 — Replace `window.confirm` in PeopleDashboard

**File:** `src/components/people/PeopleDashboard.jsx`

One `window.confirm` remains in `lockUser()` (around line 435):
```js
if (!isLocked && !window.confirm(`Lock ${name}? They won't be able to sign in.`)) return
```

`window.confirm` blocks the UI and looks jarring. Replace with an inline confirmation pattern using the existing `invokeBusy` state:

Add a new state at the top of the component (near the other `useState` calls):
```js
const [lockConfirmPending, setLockConfirmPending] = useState(false)
```

Replace the `lockUser` function body:
```js
async function lockUser() {
  if (!selected) return
  const isLocked = selected.inviteStatus === 'locked'
  if (!isLocked) {
    // First click → set pending, show inline confirmation in the button
    if (!lockConfirmPending) {
      setLockConfirmPending(true)
      return
    }
    setLockConfirmPending(false)
  }
  setInvokeBusy('lock')
  try {
    await updateDoc(doc(db, 'portalUsers', selected.id), {
      inviteStatus: isLocked ? 'renewed' : 'locked',
    })
    toast(isLocked ? 'User unlocked.' : 'User locked.', 'success')
  } catch (e) {
    toast(e?.message || 'Action failed.', 'error')
  } finally {
    setInvokeBusy('')
  }
}
```

Update the Lock button label to show the pending state:
```jsx
{selected.inviteStatus === 'locked' ? 'Unlock' : lockConfirmPending ? 'Confirm lock?' : 'Lock'}
```

Also reset `lockConfirmPending` when the panel closes — in `closeEditor()`:
```js
function closeEditor() {
  setSelected(null)
  setLockConfirmPending(false)
  // ... rest of existing closeEditor body
}
```

> **Note:** Look at the actual `lockUser` function before editing — the `updateDoc` call and the path to `portalUsers` might differ from the snippet above. Match the existing Firestore call pattern exactly; only replace the `window.confirm` guard and label.

---

## Verification Checklist

- [ ] Catalog table scrolls horizontally at 390px; checkbox column stays pinned left
- [ ] No column text visibly overflows at 390px viewport in Chrome DevTools
- [ ] `window.confirm` is gone from `PeopleDashboard.jsx` — `grep -n "window.confirm" src/` returns zero results
- [ ] Clicking "Lock" once shows "Confirm lock?" label; clicking again proceeds with lock
- [ ] Clicking "Cancel" or closing the edit panel resets the lock confirmation state
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
