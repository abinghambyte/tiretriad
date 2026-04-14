/**
 * Firestore onUpdate — Fleet CRM account automations (Phase 9).
 */
const { onDocumentUpdated } = require('firebase-functions/v2/firestore')
const { SLACK_BOT_TOKEN, SLACK_CHANNEL_ID, SLACK_SECRETS } = require('./slackSecrets')
const admin = require('firebase-admin')
const { FieldValue, Timestamp } = require('firebase-admin/firestore')
const { computeCrmScore } = require('./crmShared')
const { normalizePipelineStage, CRM_LOST_STAGE } = require('./crmPipeline')

async function slackQuiet(text) {
  const token = String(SLACK_BOT_TOKEN.value() || '').trim()
  const channel = String(SLACK_CHANNEL_ID.value() || '').trim() || '#fleet-ops'
  if (!token || !channel) return
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ channel, text }),
  })
  const json = await res.json().catch(() => ({}))
  if (!json.ok) console.error('crmAccountTrigger slack', json.error || res.status)
}

function num(v) {
  return Number(v) || 0
}

function appendNote(arr, text, by) {
  const next = Array.isArray(arr) ? [...arr] : []
  next.push({
    text,
    at: Timestamp.now(),
    by: by || 'system:crm-trigger',
  })
  return next
}

exports.crmAccountTrigger = onDocumentUpdated(
  {
    document: 'crmAccounts/{accountId}',
    region: 'us-central1',
    secrets: SLACK_SECRETS,
  },
  async (event) => {
    const before = event.data.before.data() || {}
    const after = event.data.after.data() || {}
    const ref = event.data.after.ref
    const accountId = event.params.accountId
    const db = admin.firestore()
    const now = Date.now()

    const bPain = num(before.painScore)
    const aPain = num(after.painScore)
    const bNorm = normalizePipelineStage(before.pipelineStage, before)
    const aNorm = normalizePipelineStage(after.pipelineStage, after)

    if (aPain >= 7 && bPain < 7) {
      await slackQuiet(
        `🔥 High pain — *${after.companyName || accountId}* (pain ${aPain}). Added \`hot\` tag.`,
      )
    }

    if (bNorm !== 3 && aNorm === 3) {
      await slackQuiet(`✅ *${after.companyName || accountId}* moved to Qualified.`)
    }

    if (bNorm !== 4 && aNorm === 4) {
      const jobRef = db.collection('crmJobs').doc()
      await jobRef.set({
        accountId,
        assignedToUid: null,
        jobType: 'Trial',
        location: String(after.location || 'TBD'),
        vehicleCount: num(after.fleetSize) || num(after.vehicleProfile?.vehicleCount) || 1,
        tireSizes: String(after.vehicleProfile?.tireSizeRange || ''),
        scheduledAt: null,
        completionStatus: 'Pending',
        actualTime: '',
        notes: '',
        priceQuote: null,
        finalPrice: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
      await slackQuiet(
        `📅 Quoted / trial path — *${after.companyName || accountId}* — job \`${jobRef.id}\` (DJ queue).`,
      )
    }

    const patch = {}
    let tags = Array.isArray(after.tags) ? [...after.tags] : []
    if (aPain >= 7 && bPain < 7 && !tags.includes('hot')) {
      tags = [...tags, 'hot']
      patch.tags = tags
    }

    let notes = after.notes
    if (bNorm !== 3 && aNorm === 3) {
      patch.notes = appendNote(notes, 'Qualified — ready to quote', 'system:crm-trigger')
      notes = patch.notes
    }

    const fu = after.followUpAt
    const fuMs = fu && typeof fu.toMillis === 'function' ? fu.toMillis() : null
    if (fuMs != null && fuMs < now && aNorm <= 4 && aNorm !== CRM_LOST_STAGE && !after.followUpOverdueNotified) {
      await slackQuiet(
        `⏰ Follow-up overdue — *${after.companyName || accountId}* (stage ${aNorm}).`,
      )
      patch.followUpOverdueNotified = true
    }

    if (fuMs != null && fuMs >= now && after.followUpOverdueNotified) {
      patch.followUpOverdueNotified = false
    }
    if (aNorm >= 5 || aNorm === CRM_LOST_STAGE) {
      patch.followUpOverdueNotified = false
    }

    const merged = { ...after, ...patch }
    const newScore = computeCrmScore(merged)
    if (newScore !== num(after.score)) {
      patch.score = newScore
    }

    if (Object.keys(patch).length === 0) return

    patch.updatedAt = FieldValue.serverTimestamp()
    try {
      await ref.update(patch)
    } catch (e) {
      console.error('crmAccountTrigger patch', accountId, e)
    }
  },
)
