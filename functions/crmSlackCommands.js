/**
 * Rubber CRM — Slack slash: /crm, /log, /pipeline
 * Uses SLACK_SECRETS / SLACK_BOT_TOKEN.value() via callers; posts with provided botToken.
 */
const { FieldValue, Timestamp } = require('firebase-admin/firestore')
const { formatCurrency } = require('./format')
const { fuzzyMatchAccountDoc, normalizePipelineStage, crmStageLabel, CRM_LOST_STAGE } = require('./crmPipeline')

function escapeSlackMrkdwn(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

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
    throw new Error(json.error || `${method} failed`)
  }
  return json
}

async function loadCrmAccountDocs(db, max = 500) {
  const snap = await db.collection('crmAccounts').limit(max).get()
  return snap.docs
}

async function avgTireBuyPrice(db) {
  let snap
  try {
    snap = await db.collection('tires').where('price', '>', 0).limit(500).get()
  } catch {
    return 0
  }
  let sum = 0
  let n = 0
  for (const d of snap.docs) {
    const p = Number(d.data()?.price) || 0
    if (p > 0) {
      sum += p
      n += 1
    }
  }
  return n > 0 ? sum / n : 0
}

function estimatedDealValueForAccount(data, avgBuy) {
  const vc = Math.max(0, Number(data?.vehicleProfile?.vehicleCount) || 0)
  const buy = Number(avgBuy) || 0
  if (vc <= 0 || buy <= 0) return null
  return vc * 4 * buy * 2
}

function lastLogLine(data) {
  const log = Array.isArray(data.activityLog) ? [...data.activityLog] : []
  log.sort((a, b) => {
    const ma = a?.addedAt?.toMillis?.() ?? 0
    const mb = b?.addedAt?.toMillis?.() ?? 0
    return mb - ma
  })
  const first = log[0]
  if (first) {
    return `${String(first.addedBy || '—')}: ${String(first.note || '').slice(0, 120)}`
  }
  const notes = Array.isArray(data.notes) ? data.notes : []
  const last = notes[notes.length - 1]
  if (last?.text) return `(legacy) ${String(last.text).slice(0, 120)}`
  return '—'
}

function nextActionLine(data) {
  const na = data.nextAction || {}
  const task = String(na.task || '—')
  const owner = String(na.ownedBy || '—')
  let due = '—'
  if (na.dueDate && typeof na.dueDate.toDate === 'function') {
    try {
      due = na.dueDate.toDate().toLocaleDateString('en-US', { timeZone: 'America/Denver' })
    } catch {
      due = '—'
    }
  }
  return `${task} · ${owner} · due ${due}`
}

/**
 * @param {import('firebase-admin').firestore.Firestore} db
 * @param {string} botToken
 * @param {string} fleetChannel
 * @param {Record<string, string>} form
 * @returns {Promise<object | null>}
 */
async function tryHandleCrmSlash(db, botToken, fleetChannel, form) {
  const command = String(form.command || '').trim()
  const text = String(form.text || '').trim()
  const userDisplay =
    String(form.user_name || '').trim() ||
    String(form.user_id || '').trim() ||
    'Slack user'

  if (command === '/crm') {
    if (!text) {
      return { response_type: 'ephemeral', text: 'Usage: `/crm [company name]`' }
    }
    const docs = await loadCrmAccountDocs(db)
    const match = fuzzyMatchAccountDoc(docs, text)
    if (!match) {
      return { response_type: 'ephemeral', text: `No CRM account matched “${escapeSlackMrkdwn(text)}”.` }
    }
    const data = match.data() || {}
    const avgBuy = await avgTireBuyPrice(db)
    const est = estimatedDealValueForAccount(data, avgBuy)
    const stage = crmStageLabel(data.pipelineStage)
    const lines = [
      `*Rubber CRM — ${escapeSlackMrkdwn(data.companyName || match.id)}*`,
      `*Stage:* ${escapeSlackMrkdwn(stage)}`,
      `*Next action:* ${escapeSlackMrkdwn(nextActionLine(data))}`,
      `*Last activity:* ${escapeSlackMrkdwn(lastLogLine(data))}`,
      est != null ? `*Est. deal value:* ${formatCurrency(est)}` : `*Est. deal value:* _(add vehicle profile + catalog data)_`,
    ]
    try {
      await slackApiPost(botToken, 'chat.postMessage', {
        channel: fleetChannel,
        text: `CRM: ${data.companyName || match.id}`,
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } }],
      })
    } catch (e) {
      return { response_type: 'ephemeral', text: e?.message || 'Could not post to channel.' }
    }
    return { response_type: 'ephemeral', text: 'Posted CRM account to #fleet-ops.' }
  }

  if (command === '/log') {
    if (!text) {
      return { response_type: 'ephemeral', text: 'Usage: `/log [company name] [note]`' }
    }
    const words = text.split(/\s+/).filter(Boolean)
    if (words.length < 2) {
      return { response_type: 'ephemeral', text: 'Add a note after the company name.' }
    }
    const docs = await loadCrmAccountDocs(db)
    let match = null
    let note = ''
    for (let i = words.length - 1; i >= 1; i -= 1) {
      const nameCandidate = words.slice(0, i).join(' ')
      const noteCandidate = words.slice(i).join(' ')
      const m = fuzzyMatchAccountDoc(docs, nameCandidate)
      if (m) {
        match = m
        note = noteCandidate
        break
      }
    }
    if (!match || !note.trim()) {
      return { response_type: 'ephemeral', text: 'Could not match a company name or note was empty.' }
    }
    const entry = {
      note: note.trim(),
      addedBy: userDisplay,
      addedAt: Timestamp.now(),
    }
    const prev = Array.isArray(match.data()?.activityLog) ? match.data().activityLog : []
    try {
      await match.ref.update({
        activityLog: [...prev, entry],
        updatedAt: FieldValue.serverTimestamp(),
      })
    } catch (e) {
      return { response_type: 'ephemeral', text: e?.message || 'Could not save activity.' }
    }
    return {
      response_type: 'ephemeral',
      text: `Logged on *${match.data()?.companyName || match.id}*: _${escapeSlackMrkdwn(note.trim().slice(0, 200))}_`,
    }
  }

  if (command === '/pipeline') {
    const docs = await loadCrmAccountDocs(db)
    const avgBuy = await avgTireBuyPrice(db)
    const byNorm = new Map()
    for (let s = 1; s <= 5; s += 1) byNorm.set(s, [])
    byNorm.set(CRM_LOST_STAGE, [])
    let totalEst = 0
    for (const d of docs) {
      const data = d.data() || {}
      const raw = Number(data.pipelineStage) || 1
      const n = normalizePipelineStage(raw)
      const est = estimatedDealValueForAccount(data, avgBuy)
      if (est != null) totalEst += est
      const bucket = n === CRM_LOST_STAGE ? CRM_LOST_STAGE : Math.min(5, Math.max(1, n))
      const arr = byNorm.get(bucket) || []
      arr.push({ id: d.id, name: data.companyName, est: est || 0 })
      byNorm.set(bucket, arr)
    }
    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'Rubber CRM — pipeline', emoji: true },
      },
    ]
    const order = [1, 2, 3, 4, 5, CRM_LOST_STAGE]
    const labels = {
      1: 'Spotted',
      2: 'Contacted',
      3: 'Qualified',
      4: 'Quoted',
      5: 'Closed',
      [CRM_LOST_STAGE]: 'Lost',
    }
    for (const st of order) {
      const rows = byNorm.get(st) || []
      rows.sort((a, b) => b.est - a.est)
      const topEst = rows[0]?.est || 0
      const line = `*${labels[st]}* — ${rows.length} account(s) · top est. ${formatCurrency(topEst)}`
      const names = rows
        .slice(0, 5)
        .map((r) => `• ${escapeSlackMrkdwn(r.name || r.id)}`)
        .join('\n')
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [line, names || '_none_'].join('\n'),
        },
      })
    }
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Total est. pipeline value (sum of estimates):* ${formatCurrency(totalEst)}`,
      },
    })
    try {
      await slackApiPost(botToken, 'chat.postMessage', {
        channel: fleetChannel,
        text: 'Rubber CRM pipeline summary',
        blocks,
      })
    } catch (e) {
      return { response_type: 'ephemeral', text: e?.message || 'Could not post pipeline.' }
    }
    return { response_type: 'ephemeral', text: 'Posted pipeline summary to #fleet-ops.' }
  }

  return null
}

module.exports = { tryHandleCrmSlash }
