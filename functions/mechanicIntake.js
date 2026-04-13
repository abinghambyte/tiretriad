/**
 * Public mechanic installer onboarding — Firestore + Slack (#fleet-ops).
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const admin = require('firebase-admin')
const { FieldValue } = require('firebase-admin/firestore')

const MAX_PAYLOAD_BYTES = 400_000

async function slackApiPost(token, method, body) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!json.ok) {
    throw new Error(json.error || `Slack API ${method} failed`)
  }
  return json
}

function mechanicIntakeChannel() {
  return (
    process.env.SLACK_MECHANIC_INTAKE_CHANNEL ||
    process.env.SLACK_CHANNEL_ID ||
    process.env.SLACK_NOTIFY_CHANNEL ||
    '#fleet-ops'
  )
}

function asPlainObject(v) {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return v
  try {
    return JSON.parse(JSON.stringify(v))
  } catch {
    return {}
  }
}

exports.submitMechanicIntake = onCall(async (request) => {
  const raw = request.data
  if (raw == null || typeof raw !== 'object') {
    throw new HttpsError('invalid-argument', 'Payload required.')
  }

  const size = Buffer.byteLength(JSON.stringify(raw), 'utf8')
  if (size > MAX_PAYLOAD_BYTES) {
    throw new HttpsError('invalid-argument', 'Payload too large.')
  }

  const step1 = asPlainObject(raw.step1) || {}
  const name = String(step1.name || '').trim()
  const phone = String(step1.phone || '').trim()
  if (!name) {
    throw new HttpsError('invalid-argument', 'Name is required.')
  }
  if (!phone) {
    throw new HttpsError('invalid-argument', 'Phone is required.')
  }

  const db = admin.firestore()
  const payload = {
    submittedAt: FieldValue.serverTimestamp(),
    step1: asPlainObject(raw.step1) || {},
    step2: asPlainObject(raw.step2) || {},
    step3: asPlainObject(raw.step3) || {},
    step4: asPlainObject(raw.step4) || {},
    step5: asPlainObject(raw.step5) || {},
  }

  const ref = await db.collection('mechanicProfiles').add(payload)

  const token = process.env.SLACK_BOT_TOKEN
  if (token) {
    const channel = mechanicIntakeChannel()
    const businessName = String(step1.businessName || '').trim() || '—'
    const baseLocation = String(step1.baseLocation || '').trim() || '—'
    const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'skedaddle-inventory'
    const consoleUrl = `https://console.firebase.google.com/project/${projectId}/firestore/databases/-default-/data/~2FmechanicProfiles~2F${ref.id}`

    const submittedLine = new Date().toISOString()
    const text = [
      '🔧 New mechanic intake submitted',
      `Name: ${name}`,
      `Business: ${businessName}`,
      `Phone: ${phone}`,
      `Base: ${baseLocation}`,
      `Submitted: ${submittedLine}`,
      `View in Firebase console: ${consoleUrl}`,
    ].join('\n')

    try {
      await slackApiPost(token, 'chat.postMessage', {
        channel,
        text,
      })
    } catch (e) {
      console.error('submitMechanicIntake Slack post failed', e)
    }
  } else {
    console.warn('submitMechanicIntake: SLACK_BOT_TOKEN not set; Firestore doc saved without Slack.')
  }

  return { ok: true, id: ref.id }
})
