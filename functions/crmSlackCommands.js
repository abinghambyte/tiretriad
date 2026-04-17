/**
 * Rubber CRM — Slack slash: /crm, /log, /pipeline
 * Uses SLACK_SECRETS / SLACK_BOT_TOKEN.value() via callers; posts with provided botToken.
 */
const { FieldValue, Timestamp } = require('firebase-admin/firestore')
const { formatCurrency } = require('./format')
const { fuzzyMatchAccountDoc, normalizePipelineStage, crmStageLabel, CRM_LOST_STAGE } = require('./crmPipeline')
const { slackViewsOpen, viewInputValue } = require('./slackModalShared')

const MODAL_CRM_LOOKUP_SUBMIT = 'crm_lookup_modal_submit'
const MODAL_CRM_LOG_SUBMIT = 'crm_log_modal_submit'

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

function buildCrmLookupModalView() {
  return {
    type: 'modal',
    callback_id: MODAL_CRM_LOOKUP_SUBMIT,
    title: { type: 'plain_text', text: 'CRM lookup' },
    submit: { type: 'plain_text', text: 'Submit' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'crm_lookup_company',
        label: { type: 'plain_text', text: 'Company name' },
        element: {
          type: 'plain_text_input',
          action_id: 'crm_lookup_company_field',
          multiline: false,
          placeholder: { type: 'plain_text', text: 'Match fuzzy against VIP clients (company names)' },
        },
      },
    ],
  }
}

function buildCrmLogModalView() {
  return {
    type: 'modal',
    callback_id: MODAL_CRM_LOG_SUBMIT,
    title: { type: 'plain_text', text: 'Log CRM activity' },
    submit: { type: 'plain_text', text: 'Submit' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'crm_log_company',
        label: { type: 'plain_text', text: 'Company name' },
        element: {
          type: 'plain_text_input',
          action_id: 'crm_log_company_field',
          multiline: false,
          placeholder: { type: 'plain_text', text: 'Fuzzy match' },
        },
      },
      {
        type: 'input',
        block_id: 'crm_log_note',
        label: { type: 'plain_text', text: 'Note' },
        element: {
          type: 'plain_text_input',
          action_id: 'crm_log_note_field',
          multiline: true,
          placeholder: { type: 'plain_text', text: 'What happened?' },
        },
      },
    ],
  }
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

  if (command === '/crm') {
    const tid = String(form.trigger_id || '').trim()
    if (!tid) return { response_type: 'ephemeral', text: 'Missing Slack trigger — try `/crm` again.' }
    try {
      await slackViewsOpen(botToken, tid, buildCrmLookupModalView())
      return { response_type: 'ephemeral', text: 'Opening CRM lookup…' }
    } catch (e) {
      console.error('crm views.open', e)
      return {
        response_type: 'ephemeral',
        text: `Could not open form: ${e instanceof Error ? e.message : String(e)}`,
      }
    }
  }

  if (command === '/log') {
    const tid = String(form.trigger_id || '').trim()
    if (!tid) return { response_type: 'ephemeral', text: 'Missing Slack trigger — try `/log` again.' }
    try {
      await slackViewsOpen(botToken, tid, buildCrmLogModalView())
      return { response_type: 'ephemeral', text: 'Opening CRM log form…' }
    } catch (e) {
      console.error('crm log views.open', e)
      return {
        response_type: 'ephemeral',
        text: `Could not open form: ${e instanceof Error ? e.message : String(e)}`,
      }
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
      const line = `*${labels[st]}* — ${rows.length} VIP client(s) · top est. ${formatCurrency(topEst)}`
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

/**
 * @returns {Promise<{ handled: boolean, kind?: string, body?: object }>}
 */
async function tryHandleCrmViewSubmission(db, token, envChannel, payload) {
  if (payload.type !== 'view_submission') return { handled: false }
  const cb = payload.view?.callback_id
  const botToken = String(token || '').trim()
  const fleetChannel = String(envChannel || '').trim()
  const userDisplay =
    String(payload.user?.username || '').trim() ||
    String(payload.user?.name || '').trim() ||
    String(payload.user?.id || '').trim() ||
    'Slack user'

  if (cb === MODAL_CRM_LOOKUP_SUBMIT) {
    const view = payload.view
    const text = viewInputValue(view, 'crm_lookup_company', 'crm_lookup_company_field')
    const errors = {}
    if (!String(text || '').trim()) errors.crm_lookup_company = 'Enter a company name.'
    if (Object.keys(errors).length) {
      return { handled: true, kind: 'json', body: { response_action: 'errors', errors } }
    }
    const docs = await loadCrmAccountDocs(db)
    const match = fuzzyMatchAccountDoc(docs, text)
    if (!match) {
      return {
        handled: true,
        kind: 'json',
        body: {
          response_action: 'errors',
          errors: { crm_lookup_company: `No VIP client matched “${text.slice(0, 80)}”.` },
        },
      }
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
        text: `VIP client: ${data.companyName || match.id}`,
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } }],
      })
    } catch (e) {
      return {
        handled: true,
        kind: 'json',
        body: {
          response_action: 'errors',
          errors: { crm_lookup_company: e?.message || 'Could not post to channel.' },
        },
      }
    }
    return { handled: true, kind: 'json', body: { response_action: 'clear' } }
  }

  if (cb === MODAL_CRM_LOG_SUBMIT) {
    const view = payload.view
    const company = viewInputValue(view, 'crm_log_company', 'crm_log_company_field')
    const note = viewInputValue(view, 'crm_log_note', 'crm_log_note_field')
    const errors = {}
    if (!String(company || '').trim()) errors.crm_log_company = 'Enter a company name.'
    if (!String(note || '').trim()) errors.crm_log_note = 'Enter a note.'
    if (Object.keys(errors).length) {
      return { handled: true, kind: 'json', body: { response_action: 'errors', errors } }
    }
    const docs = await loadCrmAccountDocs(db)
    const match = fuzzyMatchAccountDoc(docs, company)
    if (!match) {
      return {
        handled: true,
        kind: 'json',
        body: {
          response_action: 'errors',
          errors: { crm_log_company: `No VIP client matched “${company.slice(0, 80)}”.` },
        },
      }
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
      return {
        handled: true,
        kind: 'json',
        body: {
          response_action: 'errors',
          errors: { crm_log_note: e?.message || 'Could not save activity.' },
        },
      }
    }
    return { handled: true, kind: 'json', body: { response_action: 'clear' } }
  }

  return { handled: false }
}

module.exports = { tryHandleCrmSlash, tryHandleCrmViewSubmission, MODAL_CRM_LOOKUP_SUBMIT, MODAL_CRM_LOG_SUBMIT }
