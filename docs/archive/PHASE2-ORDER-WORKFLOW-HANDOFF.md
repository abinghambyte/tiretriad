# Phase 2 — Order Workflow Handoff
> Drop this file into Cursor. Implements the full tire sale order lifecycle across Slack + Firestore + portal.
> Reference `docs/SKEDADDLE-MASTER.md` for project context, stack, and env vars.

---

## Overview

The current implementation posts a Block Kit message to `#fleet-ops` and writes an `orders/{id}` doc on sale. This handoff extends that into a full 6-stage workflow driven by Slack buttons and Firestore state, with a portal-side customer notify button at the end.

**No in-house SMS sending.** Customer notification uses a deep link that opens the phone's native texting app with number and body pre-filled. No Twilio required for this step.

---

## Stage Map

```
pending → available → scheduled → in_transit → completed
        ↘ rejected (Kyle)
                   ↘ cancelled (either party)
```

| Stage | Status value | Who acts | How |
|---|---|---|---|
| 1 | `pending` | — | Auto on sale submit |
| 2 | `available` or `rejected` | Kyle | Slack button |
| 3 | `scheduled` or `cancelled` | DJ | Slack button + modal |
| 4 | `in_transit` | DJ | Slack button |
| 5 | `completed` | You or DJ | Portal button |

---

## Firestore Schema Additions

Add these fields to `orders/{id}` (all optional at create time, written as workflow progresses):

```
// Stage 2
kyleConfirmedAt: Timestamp
kyleRejectedAt: Timestamp
rejectionReason: string

// Stage 3
logisticsMethod: "pickup" | "dropoff"   // pickup = DJ goes to Kyle, dropoff = Kyle brings to DJ
scheduledTime: string                    // free text from modal e.g. "Tomorrow 10am"
djAcknowledgedAt: Timestamp
cancellationReason: string

// Stage 4
djPossessionAt: Timestamp

// Stage 5
customerNotifiedAt: Timestamp

// Stage 6
completedAt: Timestamp
paymentReceived: boolean
paymentAmount: number
fulfillmentTimeMinutes: number          // Math.round((completedAt - createdAt) / 60000)
handledBy: {
  supplier: string                      // Kyle's name or uid
  mechanic: string                      // DJ's name or uid
}
```

---

## Slack Message Structure Per Stage

Each stage replaces the previous Block Kit message in-place using `chat.update` with the stored `slackMessageTs`. Never post a new message — always update the existing one.

### Stage 1 — Pending (current, already built)
```
🛞 Tire sale — action required
SKU / Qty / Price / Customer / Fulfillment / Notes
[Confirm availability]  [Reject]
```

### Stage 2 — Kyle confirms → DJ notified
Message updates to:
```
🛞 Tire sale — available ✅
SKU / Qty / Price / Customer / Fulfillment / Notes
✅ Confirmed by Kyle — [time]
[Schedule pickup]  [Request drop-off]  [Cancel]
```

### Stage 2 — Kyle rejects
Message updates to:
```
🛞 Tire sale — rejected ❌
SKU / Qty / Price
❌ Rejected by Kyle — [time]
Reason: [rejectionReason]
```
No further buttons. Order is terminal.

### Stage 3 — DJ responds
Message updates to:
```
🛞 Tire sale — scheduled 📅
SKU / Qty / Price / Customer / Fulfillment
✅ Confirmed by Kyle — [time]
🚗 [Pickup / Drop-off] scheduled — DJ, [scheduledTime]
[Hand-off confirmed]  [Cancel]
```

### Stage 4 — DJ in possession
Message updates to:
```
🛞 Tire sale — in transit 🚚
SKU / Qty / Price / Customer
✅ Kyle confirmed → DJ scheduled [scheduledTime] → DJ has tires [time]
Awaiting customer fulfillment.
```
No further Slack buttons. Portal handles Stage 5.

### Stage 6 — Completed
Post a completion summary to `#fleet-ops` (new message, not update — this is a record):
```
✅ Order complete — [MSPN] x[qty]
💰 $[paymentAmount] received
⏱ Fulfilled in [fulfillmentTimeMinutes] min
👤 Kyle → DJ → [customerName]
📦 [pickup / delivery]
```

---

## `slackActions` Changes

Current handler only handles `mark_ready`. Replace with a full action router:

```js
// action_id routing
switch (actionId) {
  case 'confirm_availability':   // Kyle — stage 1 → 2
  case 'reject_order':           // Kyle — stage 1 → rejected (open reason modal)
  case 'schedule_pickup':        // DJ — stage 2 → 3, logisticsMethod: 'pickup' (open time modal)
  case 'request_dropoff':        // DJ — stage 2 → 3, logisticsMethod: 'dropoff' (open time modal)
  case 'cancel_order':           // DJ — stage 3 → cancelled (open reason modal)
  case 'confirm_possession':     // DJ — stage 3 → 4
}
```

**Modal pattern for reason/time inputs:**

When an action requires a text input (reject reason, scheduled time, cancellation reason), open a Slack modal using `views.open` with the `trigger_id` from the payload. On modal submit (`view_submission`), write to Firestore and update the message.

Modal fields:
- Reject: single plain_text_input "Reason for rejection"
- Schedule pickup / drop-off: single plain_text_input "Preferred time (e.g. Tomorrow 10am)"
- Cancel: single plain_text_input "Reason for cancellation"

**After every action:**
1. Write status + timestamp fields to `orders/{orderId}`
2. Call `chat.update` with the new Block Kit for that stage
3. Return `200` empty body within 3 seconds — do all writes async if needed

**`slackMessageTs` lookup:**
The `value` on every button is `orderId`. Load the order doc to get `slackMessageTs` for the `chat.update` call.

---

## `sendTireSaleSms` Changes

Update the initial Block Kit message to use the new Stage 1 button set:

```js
{
  type: 'actions',
  elements: [
    {
      type: 'button',
      text: { type: 'plain_text', text: 'Confirm availability' },
      style: 'primary',
      action_id: 'confirm_availability',
      value: orderId
    },
    {
      type: 'button',
      text: { type: 'plain_text', text: 'Reject' },
      style: 'danger',
      action_id: 'reject_order',
      value: orderId
    }
  ]
}
```

Remove the old `mark_ready` button.

---

## Portal UI — Stage 4 Customer Notify Button

In the orders table (or order detail view), when `status === 'in_transit'`, show a **Notify customer** button.

On click, construct a deep link and open it:

```js
const body = encodeURIComponent(
  `Hey ${order.customerName}, your tires are ready. ` +
  `${order.logisticsMethod === 'pickup' ? 'You can pick them up' : 'We\'ll deliver them to you'} ` +
  `at ${order.scheduledTime}. Reply with any questions.`
);
const smsLink = `sms:${order.customerContact}?body=${body}`;
window.open(smsLink, '_blank');
```

On click also write `customerNotifiedAt: Timestamp.now()` to the order doc.

This opens the phone's native Messages app with the number and body pre-filled. No Twilio, no in-house sending.

---

## Portal UI — Stage 5 Complete Button

When `status === 'in_transit'` (after customer notified), show a **Mark complete** button.

On click, open a small inline form:
- Payment received: yes/no toggle (default yes)
- Payment amount: number input (pre-fill with `totalPrice`)
- Confirm button

On confirm:
```js
const completedAt = Timestamp.now();
const fulfillmentTimeMinutes = Math.round(
  (completedAt.toMillis() - order.createdAt.toMillis()) / 60000
);

await updateDoc(orderRef, {
  status: 'completed',
  completedAt,
  paymentReceived: true,
  paymentAmount: amount,
  fulfillmentTimeMinutes,
  handledBy: { supplier: 'Kyle', mechanic: 'DJ' }
});
```

Then call a Firebase function (or direct Firestore write from portal) to post the completion summary to `#fleet-ops` as a new message.

---

## Completion Stats Card (`#fleet-ops` new message)

After order completes, post to `#fleet-ops`:

```
✅  Order complete
────────────────────
🔧  [MSPN] × [qty] — [description if available]
👤  [customerName]
📦  [Pickup / Drop-off → Customer delivery]
💰  $[paymentAmount] received
⏱  Fulfilled in [X] hrs [Y] min
🤝  Kyle → DJ → Customer
────────────────────
[View in portal]  ← link to order in portal
```

---

## Firestore Rules Update

```
match /orders/{orderId} {
  allow read: if request.auth != null;
  allow update: if request.auth != null
    && request.resource.data.diff(resource.data).affectedKeys()
       .hasOnly(['status', 'completedAt', 'paymentReceived', 'paymentAmount',
                 'fulfillmentTimeMinutes', 'customerNotifiedAt', 'handledBy']);
  allow write: if false; // creates only via Functions
}
```

---

## Env Vars Needed (already in `functions/.env`)

```
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_CHANNEL_ID=C...        // #fleet-ops channel ID
```

No new env vars required for this phase.

---

## Done When

- Kyle sees **Confirm availability** / **Reject** buttons on new sale message
- Confirming opens DJ's **Schedule pickup** / **Request drop-off** buttons with time modal
- DJ confirming possession moves status to `in_transit`
- Portal shows **Notify customer** button that opens native SMS app pre-filled
- Portal shows **Mark complete** button that writes completion fields
- `#fleet-ops` receives a completion summary card with fulfillment time and revenue
- Every stage transition updates the original Slack message in-place
- Firestore `orders/{id}` status field reflects current stage at all times
