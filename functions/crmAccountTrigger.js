/**
 * Firestore onUpdate — Fleet CRM account automations (Phase 9).
 */
const { onDocumentUpdated } = require('firebase-functions/v2/firestore')
const admin = require('firebase-admin')
const { FieldValue, Timestamp } = require('firebase-admin/firestore')
const { computeCrmScore } = require('./crmShared')

function slackChannelEnv() {
  return (
    process.env.SLACK_CHANNEL_ID ||
    process.env.SLACK_NOTIFY_CHANNEL ||
    '#fleet-ops'
  )
}

async function slackQuiet(text) {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) return
  const channel = slackChannelEnv()
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
    const bStage = num(before.pipelineStage) || 1
    const aStage = num(after.pipelineStage) || 1

    if (aPain >= 7 && bPain < 7) {
      await slackQuiet(
        `🔥 High pain — *${after.companyName || accountId}* (pain ${aPain}). Added \`hot\` tag.`,
      )
    }

    if (bStage !== 3 && aStage === 3) {
      await slackQuiet(`✅ *${after.companyName || accountId}* moved to stage 3 (pain confirmed).`)
    }

    if (bStage !== 5 && aStage === 5) {
      const jobRef = db.collection('crmJobs').doc()
      await jobRef.set({
        accountId,
        /** Pool jobs (null) show to all DJs; set to a uid to restrict dispatch queue. */
        assignedToUid: null,
        jobType: 'Trial',
        location: String(after.location || 'TBD'),
        vehicleCount: num(after.fleetSize) || 1,
        tireSizes: '',
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
        `📅 Trial scheduled — *${after.companyName || accountId}* — job \`${jobRef.id}\` (DJ queue).`,
      )
    }

    const patch = {}
    let tags = Array.isArray(after.tags) ? [...after.tags] : []
    if (aPain >= 7 && bPain < 7 && !tags.includes('hot')) {
      tags = [...tags, 'hot']
      patch.tags = tags
    }

    let notes = after.notes
    if (bStage !== 3 && aStage === 3) {
      patch.notes = appendNote(notes, 'Pain confirmed — ready to offer pilot', 'system:crm-trigger')
      notes = patch.notes
    }

    const fu = after.followUpAt
    const fuMs = fu && typeof fu.toMillis === 'function' ? fu.toMillis() : null
    if (fuMs != null && fuMs < now && aStage < 6 && aStage !== 7 && !after.followUpOverdueNotified) {
      await slackQuiet(
        `⏰ Follow-up overdue — *${after.companyName || accountId}* (stage ${aStage}).`,
      )
      patch.followUpOverdueNotified = true
    }

    if (fuMs != null && fuMs >= now && after.followUpOverdueNotified) {
      patch.followUpOverdueNotified = false
    }
    if (aStage >= 6 || aStage === 7) {
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
