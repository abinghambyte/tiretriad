/**
 * Handler for the Sinch Chat lead-capture HTTP endpoint.
 *
 * The Sinch Chat widget fires a `submitInitialForm` event client-side when
 * a visitor fills in the initial-screen form and starts a conversation.
 * The SinchChatMount component POSTs the form payload to this endpoint,
 * which writes a matching doc into the `crmLeads` Firestore collection.
 *
 * Visitors are anonymous by design (the portal has no customer auth), so
 * this endpoint accepts unauthenticated requests. It enforces payload size
 * limits and minimum-identifier checks to reduce casual spam. Real abuse
 * prevention (App Check, rate limiting) is follow-up work if volume spikes.
 */

const admin = require('firebase-admin')

function clampString(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max)
}

function pickField(fields, keys) {
  for (const k of keys) {
    if (fields[k] != null && String(fields[k]).trim()) return fields[k]
  }
  return ''
}

async function handleCreateSinchChatLead(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed')
    return
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const fields = body.fields && typeof body.fields === 'object' ? body.fields : {}

  const businessName = clampString(pickField(fields, ['business_name', 'businessName', 'company']), 200)
  const contactName = clampString(pickField(fields, ['contact_name', 'display_name', 'name']), 200)
  const phone = clampString(pickField(fields, ['phone', 'phoneNumber']), 32)
  const email = clampString(pickField(fields, ['email']), 254)
  const inquiry = clampString(pickField(fields, ['inquiry', 'message', 'notes']), 2000)
  const conversationId = clampString(body.conversationId || body.conversation_id, 128)
  const pageUrl = clampString(body.pageUrl, 500)
  const referrer = clampString(body.referrer, 500)

  if (!businessName && !phone && !email && !contactName) {
    res.status(400).json({ error: 'At least one identifier required (business, name, phone, or email).' })
    return
  }

  try {
    const leadRef = await admin.firestore().collection('crmLeads').add({
      businessName: businessName || contactName || 'Unknown visitor (Sinch Chat)',
      source: 'sinch_chat',
      segment: '',
      fleetSize: 0,
      urgency: 'warm',
      contactName,
      phone,
      email,
      inquiry,
      pageUrl,
      referrer,
      sinchConversationId: conversationId,
      followUpAt: null,
      convertedToAccountId: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    })
    res.status(200).json({ ok: true, leadId: leadRef.id })
  } catch (e) {
    console.error('createSinchChatLead write failed', e)
    res.status(500).json({ error: 'Could not create lead.' })
  }
}

module.exports = { handleCreateSinchChatLead }
