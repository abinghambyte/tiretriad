const { Timestamp } = require('firebase-admin/firestore')
const { computePoolDollars, buyPerTireFromOrderAndTire, round2 } = require('./financeStats')
const { denverYmdRangeMs } = require('./denverWallTime')

function csvEscape(value) {
  const s = String(value ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function csvNum(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return ''
  return x.toFixed(2)
}

function csvInt(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return ''
  return String(Math.trunc(x))
}

function denverCompletedAtYmd(ts) {
  if (!ts || typeof ts.toDate !== 'function') return ''
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Denver',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(ts.toDate())
  } catch {
    return ''
  }
}

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {{ startYmd: string, endYmd: string }} range — Denver calendar dates, inclusive
 * @returns {Promise<string>} CSV text
 */
async function buildTaxPrepCsv(db, range) {
  const bounds = denverYmdRangeMs(range.startYmd, range.endYmd)
  if (!bounds) throw new Error('Invalid date range.')

  const { startMs, endExclusiveMs } = bounds
  const startTs = Timestamp.fromMillis(startMs)
  const endTs = Timestamp.fromMillis(endExclusiveMs)

  const headers = [
    'Order ID',
    'Date (Denver)',
    'MSPN',
    'Description',
    'Qty',
    'Payment amount',
    'Buy price (per tire)',
    'FET (per tire)',
    'Mount cost (per tire)',
    'Delivery cost (per tire)',
    'Other cost (per tire)',
    'Gross margin (order)',
    'Pool amount (order)',
  ]
  const lines = [headers.join(',')]

  const snap = await db
    .collection('orders')
    .where('status', '==', 'completed')
    .where('completedAt', '>=', startTs)
    .where('completedAt', '<', endTs)
    .orderBy('completedAt', 'asc')
    .limit(4000)
    .get()

  const tireCache = new Map()
  async function tireFor(mspn) {
    const id = String(mspn || '').trim()
    if (!id) return {}
    if (tireCache.has(id)) return tireCache.get(id)
    const t = await db.collection('tires').doc(id).get()
    const data = t.exists ? t.data() || {} : {}
    tireCache.set(id, data)
    return data
  }

  for (const doc of snap.docs) {
    const o = doc.data() || {}
    const mspn = String(o.mspn || '').trim()
    const tire = await tireFor(mspn)
    const qty = Number(o.quantity) || 0
    const pay = Number(o.paymentAmount) || 0
    const buy = buyPerTireFromOrderAndTire(o, tire)
    const fet = Number(tire.fet) || 0
    const mount = Number(tire.mountCost) || 0
    const delivery = Number(tire.deliveryCost) || 0
    const other = Number(tire.otherCost) || 0
    const pool = computePoolDollars(pay, o, tire)
    const desc = String(tire.description || tire.tread || mspn || '').trim() || '—'
    const gross = round2(pool)

    lines.push(
      [
        csvEscape(doc.id),
        csvEscape(denverCompletedAtYmd(o.completedAt)),
        csvEscape(mspn),
        csvEscape(desc),
        csvEscape(csvInt(qty)),
        csvEscape(csvNum(pay)),
        csvEscape(csvNum(buy)),
        csvEscape(csvNum(fet)),
        csvEscape(csvNum(mount)),
        csvEscape(csvNum(delivery)),
        csvEscape(csvNum(other)),
        csvEscape(csvNum(gross)),
        csvEscape(csvNum(pool)),
      ].join(','),
    )
  }

  return lines.join('\n')
}

module.exports = { buildTaxPrepCsv }
