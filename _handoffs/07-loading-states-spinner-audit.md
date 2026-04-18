# Handoff 14 — Loading States & Spinner Audit

**After completing all steps and verifying the checklist, run `node scripts/gen-next-handoff.js "loading states and spinner audit complete across all major modules"` then delete this file.**

---

## Context

With all `window.alert` and `window.confirm` calls replaced, the next reliability gap is **silent loading**. Several operations (CRM stage moves, tire overhead saves, order status changes, people panel saves) show no visual feedback while async work is in-flight. Users can double-click, navigate away, or assume a hang. This handoff adds consistent loading state patterns across the major write paths.

**Pattern used throughout:** a local `saving` boolean state, disabled + opacity-reduced submit button, and a simple inline spinner SVG. No new dependencies.

**Spinner snippet** (reuse this exact JSX in every location below):

```jsx
{saving && (
  <svg className="animate-spin h-4 w-4 text-zinc-400" viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
  </svg>
)}
```

---

## Part 1 — `src/pages/OpsPage.jsx`

**Target operations:** Add Expense, Mark Fulfilled (reorder queue), Export CSV.

1. Locate the `addExpense` async handler. Add `const [savingExpense, setSavingExpense] = useState(false)` near the top of the component (or co-located with other expense state). Wrap the handler body:
   ```js
   setSavingExpense(true);
   try {
     await addDoc(...);
     toast('Expense added', 'success');
   } catch (e) {
     toast('Failed to save expense', 'error');
   } finally {
     setSavingExpense(false);
   }
   ```
2. On the Add Expense submit button, add `disabled={savingExpense}` and render the spinner inline to the left of the button label when `savingExpense` is true. Add `className` variant: `disabled:opacity-50 disabled:cursor-not-allowed`.

3. Locate the reorder queue mark-fulfilled handler. Add `const [fulfillingId, setFulfillingId] = useState(null)`. In the handler:
   ```js
   setFulfillingId(itemId);
   try { await updateDoc(...); }
   catch (e) { toast('Failed to update', 'error'); }
   finally { setFulfillingId(null); }
   ```
   On each row's fulfill button: `disabled={fulfillingId === item.id}` + spinner when matching.

4. Locate the tax CSV export button handler. Add `const [exportingCsv, setExportingCsv] = useState(false)`. Wrap it:
   ```js
   setExportingCsv(true);
   try { /* existing export logic */ }
   finally { setExportingCsv(false); }
   ```
   Button: `disabled={exportingCsv}` + spinner when true.

---

## Part 2 — `src/components/people/PeopleDashboard.jsx`

**Target operations:** Save user edits (the panel submit), Lock/Unlock user, Delete user, Revoke invite, Apply role defaults.

1. Add `const [savingUser, setSavingUser] = useState(false)` alongside existing editor state. In the save/submit handler for the edit panel:
   ```js
   setSavingUser(true);
   try { await updateDoc(...); toast('Saved', 'success'); closeEditor(); }
   catch (e) { toast('Save failed', 'error'); }
   finally { setSavingUser(false); }
   ```
   The Save button in the panel footer: `disabled={savingUser}` + spinner.

2. For Lock/Unlock: the existing `lockConfirmPending` two-click pattern already exists. On the second-click handler (the actual lock call), add `const [lockingUser, setLockingUser] = useState(false)`. Wrap:
   ```js
   setLockingUser(true);
   try { await updateDoc(...); toast(...); }
   catch (e) { toast('Failed', 'error'); }
   finally { setLockingUser(false); setLockConfirmPending(false); }
   ```
   The confirmed lock button: `disabled={lockingUser}` + spinner.

3. For Delete user: same pattern — `const [deletingUser, setDeletingUser] = useState(false)`. The existing two-click confirm state (`deleteConfirmPending` or whatever variable name is in the file) wraps a `deleteDoc` or callable. Wrap that call with `deletingUser` flag. Button: `disabled={deletingUser}` + spinner.

4. For Revoke invite / Apply role defaults: these are lower-stakes but still async. Add a single `const [pendingAction, setPendingAction] = useState(null)` to track which row/action is in flight. In each handler, `setPendingAction('revoke-' + uid)` before the await, `setPendingAction(null)` in finally. Inline button: `disabled={pendingAction === 'revoke-' + uid}`.

---

## Part 3 — `src/components/orders/OrdersList.jsx`

**Target operations:** Status change buttons (every stage-advance and stage-revert call), Add order, Delete order.

1. Add `const [changingStatusId, setChangingStatusId] = useState(null)` at the top of the component. Every status-change handler currently does an `updateDoc` — wrap each:
   ```js
   setChangingStatusId(orderId);
   try { await updateDoc(...); }
   catch (e) { toast('Status update failed', 'error'); }
   finally { setChangingStatusId(null); }
   ```
   On each status button: `disabled={changingStatusId === order.id}` + show spinner in place of the button icon/label when matching.

2. For Add order: add `const [addingOrder, setAddingOrder] = useState(false)`. Wrap the `addDoc` call. The submit/create button in the add-order form: `disabled={addingOrder}` + spinner.

3. For Delete order (the two-click confirm pattern added in Handoff 13): add `const [deletingOrderId, setDeletingOrderId] = useState(null)`. On the confirmed delete handler:
   ```js
   setDeletingOrderId(orderId);
   try { await deleteDoc(...); toast('Order removed', 'success'); }
   catch (e) { toast('Delete failed', 'error'); }
   finally { setDeletingOrderId(null); }
   ```
   The confirmed delete button: `disabled={deletingOrderId === order.id}` + spinner.

---

## Part 4 — `src/components/crm/CrmAccountDetailPanel.jsx`

**Target operations:** Save account edits, Add activity log entry, Remove vehicle (two-click confirm from Handoff 13).

1. Add `const [savingAccount, setSavingAccount] = useState(false)`. In the save handler:
   ```js
   setSavingAccount(true);
   try { await updateDoc(...); toast('Account saved', 'success'); }
   catch (e) { toast('Save failed', 'error'); }
   finally { setSavingAccount(false); }
   ```
   Save button: `disabled={savingAccount}` + spinner.

2. Add `const [loggingActivity, setLoggingActivity] = useState(false)`. Wrap the activity log `updateDoc`/`arrayUnion` call. Submit button for the activity input: `disabled={loggingActivity}` + spinner.

3. For Remove vehicle: the two-click confirm state is already in place from Handoff 13. Add `const [removingVehicle, setRemovingVehicle] = useState(false)`. On the confirmed remove handler, wrap the write. The confirmed remove button: `disabled={removingVehicle}` + spinner.

---

## Part 5 — `src/components/tires/TiresDashboard.jsx` and `src/components/tires/MarginTable.jsx`

**Target operations:** Save overhead value, Bulk CTS apply (if `BulkCtsModal` exists as inline state rather than separate file — check first).

1. **`TiresDashboard.jsx`** — locate the overhead save handler (updates a tire doc or a settings doc with overhead value). Add `const [savingOverhead, setSavingOverhead] = useState(false)`. Wrap the write. Save button: `disabled={savingOverhead}` + spinner.

2. **`MarginTable.jsx`** — locate the inline cost edit save (the per-row cost field blur/submit handler). Add `const [savingCostId, setSavingCostId] = useState(null)`. In the handler:
   ```js
   setSavingCostId(tireId);
   try { await updateDoc(...); }
   catch (e) { toast('Save failed', 'error'); }
   finally { setSavingCostId(null); }
   ```
   The row's save affordance (checkmark button or on-blur): `disabled={savingCostId === tire.id}`.

---

## Part 6 — `src/pages/ContactsPage.jsx`

**Target operations:** Add contact, Remove contact (two-click confirm from Handoff 13).

1. Add `const [addingContact, setAddingContact] = useState(false)`. Wrap the `setDoc`/`addDoc` call in the add-contact submit handler. Submit button: `disabled={addingContact}` + spinner.

2. For remove contact: the two-click confirm pattern is already in place. Add `const [removingContact, setRemovingContact] = useState(false)`. Wrap the `deleteDoc`. The confirmed delete button: `disabled={removingContact}` + spinner.

---

## Part 7 — `src/pages/TaskDispatcher.jsx`

**Target operation:** Clear handoff (two-click confirm from Handoff 13), Copy prompt.

1. For clear handoff: the two-click confirm is already wired. Add `const [clearingHandoff, setClearingHandoff] = useState(false)`. Wrap the clear write. Confirmed clear button: `disabled={clearingHandoff}` + spinner.

2. For copy prompt: `navigator.clipboard.writeText()` is async. Add `const [copying, setCopying] = useState(false)`. Wrap:
   ```js
   setCopying(true);
   try { await navigator.clipboard.writeText(prompt); toast('Copied', 'success'); }
   catch { toast('Copy failed — try manually', 'error'); }
   finally { setCopying(false); }
   ```
   Copy button: `disabled={copying}` + spinner (or swap label to "Copied!" for 1.5 s).

---

## Verification Checklist

- [ ] `OpsPage.jsx`: Add Expense button shows spinner and is disabled while saving; no double-submit possible
- [ ] `OpsPage.jsx`: Fulfill button per reorder row shows spinner for only the clicked row, not all rows
- [ ] `OpsPage.jsx`: Export CSV button shows spinner and is disabled during export
- [ ] `PeopleDashboard.jsx`: Panel Save button shows spinner and is disabled while `savingUser` is true
- [ ] `PeopleDashboard.jsx`: Lock confirm second-click button shows spinner; `lockConfirmPending` resets in `finally`
- [ ] `PeopleDashboard.jsx`: Delete confirm second-click button shows spinner; state resets in `finally`
- [ ] `OrdersList.jsx`: Status change buttons are disabled per-order (not globally) while change is in flight
- [ ] `OrdersList.jsx`: Add order button disabled + spinner while `addingOrder`
- [ ] `OrdersList.jsx`: Delete confirm button disabled + spinner while `deletingOrderId` matches
- [ ] `CrmAccountDetailPanel.jsx`: Save button disabled + spinner while `savingAccount`
- [ ] `CrmAccountDetailPanel.jsx`: Log activity button disabled + spinner while `loggingActivity`
- [ ] `CrmAccountDetailPanel.jsx`: Remove vehicle confirm button disabled + spinner while `removingVehicle`
- [ ] `TiresDashboard.jsx`: Overhead save button disabled + spinner while `savingOverhead`
- [ ] `MarginTable.jsx`: Per-row cost save disabled for that row only while `savingCostId` matches
- [ ] `ContactsPage.jsx`: Add contact submit disabled + spinner while `addingContact`
- [ ] `ContactsPage.jsx`: Remove contact confirm disabled + spinner while `removingContact`
- [ ] `TaskDispatcher.jsx`: Clear handoff confirm disabled + spinner while `clearingHandoff`
- [ ] `TaskDispatcher.jsx`: Copy prompt button handles clipboard failure with toast
- [ ] No spinner SVG is visible after the async operation completes (state resets in `finally` block in every case)
- [ ] No existing toast calls were removed — only loading state was added around them
- [ ] `npm run lint` passes with no new errors
- [ ] `npm run build` completes successfully