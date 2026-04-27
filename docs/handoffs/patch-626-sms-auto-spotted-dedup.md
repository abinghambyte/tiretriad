---
patch: 626
title: SMS auto-Spotted lead with dedup against existing prospects + customers
size: S
status: ready-to-dispatch
priority: P2 — workflow win, not a regression block
depends_on: [624]
spec: docs/superpowers/specs/2026-04-27-crm-rebuild-design.md
batch: crm-rebuild
---

# patch-626 — SMS auto-Spotted with dedup

Backend-only patch. Extends `functions/inboundSms.js` to classify inbound SMS three ways and route accordingly. Depends on patch-624's denormalized `lastTouchAt` field.

## Files touched

- `functions/inboundSms.js` — add classification logic before the existing handler logic
- `functions/touchCrmAccount.js` (from patch-624) — used here
- `functions/inboundSms.test.js` — extend with 3 routing test cases

## Routing logic

```js
import { isArchived } from '../src/utils/isArchived.js'
import { touchAccount } from './touchCrmAccount.js'
import { normalizePhone } from './phoneDocId.js'  // existing

async function classifyInboundSms({ phoneRaw, body }) {
  const phone = normalizePhone(phoneRaw)

  // 1. Existing prospect (live crmAccount with this phone)
  const acctSnap = await db.collection('crmAccounts')
    .where('contactPhone', '==', phone)
    .get()
  const liveAccounts = acctSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((a) => !isArchived(a))

  if (liveAccounts.length > 0) {
    const acct = liveAccounts[0]
    await db.collection('crmAccounts').doc(acct.id).collection('activity').add({
      type: 'sms-in',
      body,
      at: FieldValue.serverTimestamp(),
    })
    await touchAccount(acct.id)
    await postSlack(`📩 Existing prospect **${acct.companyName}** reached out: "${body.slice(0, 80)}${body.length > 80 ? '…' : ''}"`)
    return { route: 'existing-prospect', accountId: acct.id }
  }

  // 2. Existing customer (live contacts doc with this phone)
  const contactSnap = await db.collection('contacts').where('phone', '==', phone).limit(1).get()
  if (!contactSnap.empty) {
    const contact = { id: contactSnap.docs[0].id, ...contactSnap.docs[0].data() }
    if (!isArchived(contact)) {
      await contactSnap.docs[0].ref.collection('messages').add({
        direction: 'in',
        body,
        at: FieldValue.serverTimestamp(),
      })
      await postSlack(`💬 Customer **${contact.name}** sent SMS: "${body.slice(0, 80)}${body.length > 80 ? '…' : ''}"`)
      return { route: 'existing-customer', contactId: contact.id }
    }
  }

  // 3. New lead — no match
  const newRef = await db.collection('crmAccounts').add({
    companyName: '(unknown)',
    contactPhone: phone,
    pipelineStage: 1,  // Spotted (v3)
    schemaVersion: 3,
    source: 'sms',
    estValueCents: 0,
    lastTouchAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  })
  await newRef.collection('activity').add({
    type: 'sms-in',
    body,
    at: FieldValue.serverTimestamp(),
  })
  await postSlack(`🆕 New lead from SMS: "${body.slice(0, 80)}${body.length > 80 ? '…' : ''}" — phone ${phone}`)
  return { route: 'new-lead', accountId: newRef.id }
}
```

The existing `inboundSms` handler should call `classifyInboundSms` first, then proceed with whatever existing notification logic remains (or replace if the existing handler was ad-hoc).

## Acceptance

- [ ] Inbound SMS from a known prospect → activity log appended; `lastTouchAt` updated; Slack "📩 Existing prospect..."
- [ ] Inbound SMS from a known customer → message logged on contact; Slack "💬 Customer..."
- [ ] Inbound SMS from unknown phone → new crmAccount with `pipelineStage: 1`, `source: 'sms'`, `schemaVersion: 3`; Slack "🆕 New lead..."
- [ ] Phone normalization (`normalizePhone`) handles formatting variations: `+13035551234`, `(303) 555-1234`, `3035551234` all match the same dedup key
- [ ] Archived crmAccounts / contacts do NOT match (treated as no-match → new lead created)
- [ ] Tests cover all 4 routing branches (3 routes + 1 archived-shouldn't-match)
- [ ] Deployed via `npm run deploy:firebase`
- [ ] Manual smoke: send a test SMS from your phone (existing customer pattern); verify Slack message + no duplicate crmAccount

## Notes for the agent

- Patch-624 must land first. This patch reads `lastTouchAt` (via `touchAccount`) and depends on the field existing.
- The `contactPhone` field on `crmAccounts` may not be populated on all existing docs. Confirm via inspection — if some leads have no phone, the dedup query returns no match and a duplicate gets created. Add a graceful fallback or backfill phones in patch-624's migration.
- Slack 80-char truncation is a guess; tune to whatever Slack message preview limit reads cleanly.
- The "existing customer" branch assumes contacts collection has `phone` and `name` fields. Verify schema before relying on those names. If different, normalize.
