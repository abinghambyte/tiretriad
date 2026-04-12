# Phase 5 — Features & Intelligence Handoff
> Drop this into Cursor after Phase 4 is complete.
> Implements The Wall, Morning Brief, Customer Memory, The Debrief, Dead Stock Radar, Order Soundtrack, The Anomaly Flag, and the Anomaly Flag.
> Reference `docs/SKEDADDLE-MASTER.md` for stack and `docs/PHASE2-ORDER-WORKFLOW-HANDOFF.md` for order schema.

---

## The Wall — `/wall`

A live read-only feed of completed orders. Accessible to all crew (any authenticated user with `permissions.wall === 'view'`). No editing, no actions — just the work, documented.

### UI
- Full-width dark card feed, newest first
- Each card shows: MSPN × qty, customer name, revenue, fulfillment time, crew tags who handled it (Source → Field → Customer), fulfillment method
- Filter bar: date range picker, crew member filter, min revenue filter
- Auto-updates via `onSnapshot` on `orders` where `status === 'completed'`
- Subtle entrance animation per card as new completions come in

### Card design
```
✅  [MSPN] × [qty]                          $[paymentAmount]
    [customerName]                    ⏱ [fulfillmentTimeMinutes] min
    [Source → Field] · [pickup/drop-off/delivery]
    [completedAt formatted as "Today 2:41 PM" or "Apr 11"]
```

If `hatTrickDay === true` on a card, show a small 🎩 badge. If `convertedAfterPoke === true`, show a small nudge icon. If `frictionScore > 50`, show a subtle friction indicator.

### Route
Add `/wall` as a protected route. Add **The Wall** as a dashboard card — status: Live, accessible to all roles except Spotter with `none`.

---

## The Morning Brief — Scheduled Cloud Function

Fires at 7:00 AM MT every weekday (Monday–Friday).

### Setup
```js
// functions/index.js
export const morningBrief = onSchedule('0 14 * * 1-5', async () => {
  // 14:00 UTC = 7:00 AM MT (MST). Adjust for MDT (13:00 UTC) seasonally.
});
```

### Content
Query Firestore for:
- `orders` where `status` is `pending` or `in_transit` → open order count
- `orders` where `completedAt` >= yesterday midnight and `status === 'completed'` → yesterday's revenue (sum `paymentAmount`)
- `meta/djStats` → `currentStreak`
- `tires` where `deadStockFlag === true` → count
- Weather: fetch `https://wttr.in/Fort+Collins?format="%C+%t"` (free, no key needed)

### Slack message format
```
☀️  Morning brief — [Day, Date]
────────────────────────────
📋  Open orders: [n] pending / [n] in transit
💰  Yesterday: $[revenue] across [n] orders
🔥  DJ streak: [n] clean orders
🚨  Dead stock: [n] tires flagged (90+ days, no movement)
🌤  Fort Collins: [weather condition] [temp]
────────────────────────────
```

If yesterday revenue is $0, replace that line with something dry: "💰  Yesterday: quiet."
If DJ streak is 0, omit the streak line entirely.
Post to `#fleet-ops`.

---

## Customer Memory — `contacts/{e164Phone}` collection

Build a lightweight customer list as a byproduct of order activity. No manual entry required.

### Write on order completion
```js
const contactRef = db.collection('contacts').doc(order.customerContact);
await contactRef.set({
  phoneNumber: order.customerContact,
  name: order.customerName,
  lastOrderAt: Timestamp.now(),
  lastMspn: order.mspn,
}, { merge: true });

await contactRef.update({
  orderCount: FieldValue.increment(1),
  totalSpend: FieldValue.increment(order.paymentAmount),
});
```

### Schema: `contacts/{e164Phone}`
```
phoneNumber: string
name: string
orderCount: number
totalSpend: number
lastOrderAt: Timestamp
lastMspn: string
notes: string               // manual, editable from portal
repeatGhost: boolean        // synced from ghostContacts collection
tags: array                 // future — "fleet", "repeat", "referral"
```

### Portal integration
In `SaleMessenger.jsx`, when the customer contact field is filled in, query `contacts/{phone}`. If found, show a subtle card below the input:

```
👤  [Name] — [orderCount] orders · $[totalSpend] lifetime · Last: [lastMspn] [lastOrderAt]
```

If `repeatGhost === true`, show: `👻 Repeat ghost — flagged [n] times`

This is read-only context — the rep sees it, doesn't have to do anything with it.

### Contacts page — `/contacts`

Simple table: Name, Phone, Orders, Total spend, Last order, Notes, Tags.
Sortable by any column. Search by name or phone.
Click a row → slide-in panel with full order history for that contact (query `orders` where `customerContact === phone`).
Notes field is editable inline — writes to `contacts/{phone}.notes`.

Add **Contacts** as a dashboard card — status: Live.

---

## The Debrief — Post-order optional notes

After an order moves to `completed`, show a small optional prompt in the portal on the order row or detail view:

```
📝  Quick debrief (optional)
[Any notes about this job?          ]
[Would you work with this customer again?  Yes  No  Maybe]
[Save debrief]  [Skip]
```

On save, write to `orders/{id}.debrief`:
```js
debrief: {
  notes: string,
  repeatCustomer: "yes" | "no" | "maybe",
  writtenAt: Timestamp,
  writtenBy: uid
}
```

Also write `debrief.repeatCustomer` to `contacts/{phone}.repeatCustomerVote` (last vote wins).

The debrief prompt only shows once per order. After saved or skipped, it disappears. If notes contain something that looks like a fleet size mention (e.g. "has 8 more vans"), don't parse it — just surface it visually in the contact panel as raw debrief text. Let the human read it.

---

## Dead Stock Radar — Weekly Cloud Function

Fires every Monday at 6:00 AM MT.

```js
export const deadStockRadar = onSchedule('0 13 * * 1', async () => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  // Get all MSPNs that have had an order in last 90 days
  const recentOrders = await db.collection('orders')
    .where('createdAt', '>=', Timestamp.fromDate(cutoff))
    .get();
  const activeMspns = new Set(recentOrders.docs.map(d => d.data().mspn));

  // Flag tires not in active set and with CTS data entered (cost > 0)
  const tires = await db.collection('tires')
    .where('cost', '>', 0)
    .get();

  const batch = db.batch();
  let flagCount = 0;

  tires.docs.forEach(doc => {
    const mspn = doc.id;
    const wasActive = activeMspns.has(mspn);
    const isCurrentlyFlagged = doc.data().deadStockFlag === true;

    if (!wasActive && !isCurrentlyFlagged) {
      batch.update(doc.ref, { deadStockFlag: true, deadStockFlaggedAt: Timestamp.now() });
      flagCount++;
    } else if (wasActive && isCurrentlyFlagged) {
      batch.update(doc.ref, { deadStockFlag: false, deadStockFlaggedAt: null });
    }
  });

  await batch.commit();

  if (flagCount > 0) {
    // Post to #fleet-ops
    await postToSlack(`📦 Dead stock radar: ${flagCount} tire SKUs flagged (90+ days, no orders, cost data present). Check the margin table.`);
  }
});
```

### Margin table integration
In `MarginTable.jsx`, for rows where `deadStockFlag === true`, show a subtle amber dot or "📦" badge in the description cell. Hovering it shows: "No orders in 90+ days." Add a **Dead stock only** filter toggle to the filter bar.

---

## Order Soundtrack — Completion audio

When an order status changes to `completed` in the portal (detected via `onSnapshot`), play a short satisfying sound. Web Audio API — no external file.

```js
function playCompletionSound() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  
  // Two-note resolution: a fifth interval, low and clean
  [130.81, 196.00].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = freq;
    const start = ctx.currentTime + i * 0.15;
    gain.gain.setValueAtTime(0.2, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 1.2);
    osc.start(start);
    osc.stop(start + 1.2);
  });
}
```

Only fires if the status transition is detected during the current portal session (not on page load of already-completed orders). Add a sound toggle in user preferences — stored in `localStorage` as `skedaddle-sound-enabled` (default: true).

---

## The Anomaly Flag — Pricing check on order create

In `sendTireSaleSms` (Cloud Function), after the order doc is created, check pricing:

```js
const tireDoc = await db.collection('tires').doc(order.mspn).get();
if (tireDoc.exists) {
  const retail = tireDoc.data().price || tireDoc.data().retailPrice;
  if (retail > 0) {
    const discount = (retail - order.pricePerTire) / retail;
    if (discount > 0.40) {
      await db.collection('orders').doc(orderId).update({
        pricingAnomaly: true,
        pricingAnomalyPct: Math.round(discount * 100)
      });
      await postToSlack(
        `⚠️ Pricing check — Order ${orderId}: $${order.pricePerTire}/tire is ${Math.round(discount * 100)}% below retail ($${retail}). Intentional?`
      );
    }
  }
}
```

In the orders table, flag anomaly orders with a subtle amber indicator. No action required — just visibility.

---

## Firestore Rules additions

```js
// contacts — authenticated read, portal can write notes only
match /contacts/{phone} {
  allow read: if request.auth != null;
  allow update: if request.auth != null
    && request.resource.data.diff(resource.data).affectedKeys()
       .hasOnly(['notes', 'tags']);
  allow create, delete: if false; // Functions only
}

// orders — add debrief to portal-allowed write keys
// (add to existing orders rule alongside existing allowed keys)
// 'debrief'
```

---

## Dashboard Cards to Add

| Card | Route | Status badge | Visible to |
|---|---|---|---|
| The Wall | `/wall` | Live | All crew |
| Contacts | `/contacts` | Live | Overwatch, Scout (future) |

---

## Done When

- `/wall` shows live completed order feed with filters, hat trick badges, friction indicators
- Morning Brief posts to `#fleet-ops` weekdays at 7am MT with open orders, revenue, DJ streak, dead stock count, weather
- Customer contact autocomplete in sale form shows order history and ghost flag
- `/contacts` page shows full customer list with order history slide-in
- Debrief prompt appears after order completion, saves notes and repeat vote
- Dead Stock Radar runs weekly, flags tires in margin table, unflag on activity
- Completion sound plays in portal when order completes (with toggle)
- Anomaly Flag fires to `#fleet-ops` when price is 40%+ below retail
