/**
 * Batch 1 finance slash commands (/spoils, /owed, /payout, /revenue).
 * Runs only inside `slackActions` (must declare `secrets: SLACK_SECRETS` there).
 */
const { SLACK_SECRETS } = require('./slackSecrets')
const { Timestamp } = require('firebase-admin/firestore')
const { formatCurrency, formatPercent } = require('./format')
const {
  REVENUE_REF,
  CREW_REF,
  CREW_KEYS,
  CREW_SPLIT,
  computePoolDollars,
  denverYear,
  round2,
  defaultCrewDoc,
} = require('./financeStats')
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

function parseWindow(arg) {
  const a = String(arg || 'daily').trim().toLowerCase()
  if (['daily', 'weekly', 'ytd', 'total'].includes(a)) return a
  return 'daily'
}

function windowStartMs(window) {
  const now = Date.now()
  if (window === 'daily') return now - 86400000
  if (window === 'weekly') return now - 7 * 86400000
  if (window === 'ytd') {
    const y = denverYear(now)
    return Date.UTC(y, 0, 1, 7, 0, 0)
  }
  return Date.UTC(2020, 0, 1)
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 */
async function fetchCompletedOrdersInWindow(db, window) {
  const startMs = windowStartMs(window)
  const startTs = Timestamp.fromMillis(startMs)
  const pageSize = 300
  const rows = []
  let last = null
  for (let guard = 0; guard < 40; guard += 1) {
    let q = db
      .collection('orders')
      .where('status', '==', 'completed')
      .where('completedAt', '>=', startTs)
      .orderBy('completedAt', 'asc')
      .limit(pageSize)
    if (last) q = q.startAfter(last)
    const snap = await q.get()
    if (snap.empty) break
    for (const d of snap.docs) {
      rows.push({ id: d.id, data: d.data() || {} })
    }
    last = snap.docs[snap.docs.length - 1]
    if (snap.size < pageSize) break
  }
  return rows
}

async function tireMapForOrders(db, rows) {
  const mspns = [...new Set(rows.map((r) => String(r.data.mspn || '').trim()).filter(Boolean))]
  const tireByMspn = new Map()
  const chunk = 30
  for (let i = 0; i < mspns.length; i += chunk) {
    const slice = mspns.slice(i, i + chunk)
    const snaps = await Promise.all(slice.map((id) => db.collection('tires').doc(id).get()))
    for (let j = 0; j < slice.length; j += 1) {
      if (snaps[j].exists) tireByMspn.set(slice[j], snaps[j].data() || {})
    }
  }
  return tireByMspn
}

async function handleSlashSpoils(db, token, channel, text) {
  const window = parseWindow(String(text || '').trim().split(/\s+/)[0])
  const rows = await fetchCompletedOrdersInWindow(db, window)
  const tires = await tireMapForOrders(db, rows)
  let poolSum = 0
  let skipped = 0
  for (const { data } of rows) {
    const pay = Number(data.paymentAmount)
    if (!Number.isFinite(pay)) {
      skipped += 1
      continue
    }
    const mspn = String(data.mspn || '').trim()
    const tire = tires.get(mspn) || {}
    poolSum += computePoolDollars(pay, data, tire)
  }
  poolSum = round2(poolSum)
  const lines = CREW_KEYS.map(
    (k) =>
      `*${k}* (${(CREW_SPLIT[k] * 100).toFixed(0)}%): ${formatCurrency(round2(poolSum * (CREW_SPLIT[k] || 0)))}`,
  )
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: [
          `*💵 Spoils (${window})*`,
          `_Completed orders in window · pool = payment − (buy + CTS) × qty_`,
          `*Pool total:* ${formatCurrency(poolSum)}`,
          skipped ? `_Skipped ${skipped} order(s) (no paymentAmount)._` : '',
          '',
          '*Crew split:*',
          ...lines,
        ]
          .filter(Boolean)
          .join('\n'),
      },
    },
  ]
  await slackApiPost(token, 'chat.postMessage', {
    channel,
    text: `Spoils ${window}: ${formatCurrency(poolSum)}`,
    blocks,
  })
  return { response_type: 'ephemeral', text: `Posted spoils (${window}) to channel.` }
}

async function handleSlashOwed(db, token, channel) {
  const snap = await CREW_REF(db).get()
  const data = snap.exists ? snap.data() || {} : defaultCrewDoc()
  const members = data.members || {}
  const lines = CREW_KEYS.map((k) => {
    const m = members[k] || {}
    return `*${k}* — earned ${formatCurrency(Number(m.totalEarned) || 0)} · paid ${formatCurrency(Number(m.totalPaid) || 0)} · balance ${formatCurrency(Number(m.balance) || 0)}`
  })
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: ['*🧾 Crew balances*', '', ...lines].join('\n'),
      },
    },
  ]
  await slackApiPost(token, 'chat.postMessage', {
    channel,
    text: 'Crew earnings snapshot',
    blocks,
  })
  return { response_type: 'ephemeral', text: 'Posted /owed to channel.' }
}

async function handleSlashPayout(db, token, channel, text, userName) {
  const parts = String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length < 2) {
    return { response_type: 'ephemeral', text: 'Usage: `/payout [name] [amount]` — names: alex, dj, tanner, kyle' }
  }
  const name = String(parts[0] || '').toLowerCase()
  const amt = Number(parts[1])
  if (!CREW_KEYS.includes(name) || !Number.isFinite(amt) || amt <= 0) {
    return { response_type: 'ephemeral', text: 'Invalid crew name or amount.' }
  }

  const crewRef = CREW_REF(db)
  let newPaid = 0
  let newBal = 0
  let earned = 0
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(crewRef)
    const base = snap.exists ? snap.data() || {} : defaultCrewDoc()
    const members = { ...(base.members || {}) }
    const cur = members[name] && typeof members[name] === 'object' ? members[name] : {}
    earned = Number(cur.totalEarned) || 0
    const prevPaid = Number(cur.totalPaid) || 0
    newPaid = round2(prevPaid + amt)
    newBal = round2(earned - newPaid)
    members[name] = {
      totalEarned: earned,
      totalPaid: newPaid,
      balance: newBal,
      lastUpdatedAt: Timestamp.now(),
    }
    const log = Array.isArray(base.payoutLog) ? [...base.payoutLog] : []
    log.push({
      at: Timestamp.now(),
      amount: amt,
      name,
      recordedBy: String(userName || 'slack').slice(0, 64),
    })
    while (log.length > 80) log.shift()
    tx.set(crewRef, { ...base, members, payoutLog: log }, { merge: true })
  })

  await slackApiPost(token, 'chat.postMessage', {
    channel,
    text: `Payout ${name} ${formatCurrency(amt)}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `✅ *Payout recorded* — *${escapeSlackMrkdwn(name)}* ${formatCurrency(amt)} by *${escapeSlackMrkdwn(userName || 'user')}*\nNew paid total ${formatCurrency(newPaid)} · balance ${formatCurrency(newBal)}`,
        },
      },
    ],
  })
  return { response_type: 'ephemeral', text: 'Payout posted.' }
}

function marginPct(rev, margin) {
  const r = Number(rev) || 0
  if (r <= 0) return null
  return round2((100 * (Number(margin) || 0)) / r)
}

async function handleSlashRevenue(db, token, channel, text) {
  const window = parseWindow(String(text || '').trim().split(/\s+/)[0])
  const snap = await REVENUE_REF(db).get()
  const d = snap.exists ? snap.data() || {} : {}
  let rev = 0
  let cost = 0
  let margin = 0
  if (window === 'daily') {
    rev = Number(d.dailyRevenue) || 0
    cost = Number(d.dailyCost) || 0
    margin = Number(d.dailyMargin) || 0
  } else if (window === 'weekly') {
    rev = Number(d.weeklyRevenue) || 0
    cost = Number(d.weeklyCost) || 0
    margin = Number(d.weeklyMargin) || 0
  } else if (window === 'ytd') {
    rev = Number(d.ytdRevenue) || 0
    cost = Number(d.ytdCost) || 0
    margin = Number(d.ytdMargin) || 0
  } else {
    rev = Number(d.allTimeRevenue) || 0
    cost = Number(d.allTimeCost) || 0
    margin = Number(d.allTimeMargin) || 0
  }
  const pct = marginPct(rev, margin)
  const pctStr = pct == null ? '—' : formatPercent(pct, 1)
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: [
          `*📊 Revenue (${window})*`,
          `*Revenue:* ${formatCurrency(rev)}`,
          `*Cost:* ${formatCurrency(cost)}`,
          `*Gross margin:* ${formatCurrency(margin)}`,
          `*Margin %:* ${pctStr}`,
        ].join('\n'),
      },
    },
  ]
  await slackApiPost(token, 'chat.postMessage', {
    channel,
    text: `Revenue ${window}`,
    blocks,
  })
  return { response_type: 'ephemeral', text: 'Posted /revenue.' }
}

/**
 * @returns {Promise<object|null>} Slack response body or null if not handled
 */
async function tryHandleFinanceSlash(db, token, channel, form) {
  if (!Array.isArray(SLACK_SECRETS) || SLACK_SECRETS.length < 1) {
    return { response_type: 'ephemeral', text: 'Slack secrets not configured.' }
  }
  const command = String(form.command || '').trim()
  const text = String(form.text || '')
  const userName = String(form.user_name || form.user_id || 'slack')
  const ch = String(channel || '').trim()
  if (!token || !ch) {
    return { response_type: 'ephemeral', text: 'Slack token or channel missing.' }
  }

  if (command === '/spoils') {
    return handleSlashSpoils(db, token, ch, text)
  }
  if (command === '/owed') {
    return handleSlashOwed(db, token, ch)
  }
  if (command === '/payout') {
    return handleSlashPayout(db, token, ch, text, userName)
  }
  if (command === '/revenue') {
    return handleSlashRevenue(db, token, ch, text)
  }
  return null
}

module.exports = {
  tryHandleFinanceSlash,
}
