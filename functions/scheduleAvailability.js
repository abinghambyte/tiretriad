/**
 * Denver-based crew availability + order hour occupancy (Batch 3).
 * Operating hours: hour integers 8–17 inclusive (8am block … 5pm block ending 6pm).
 */
const DENVER = 'America/Denver'

/** @returns {string} YYYY-MM-DD in Denver */
function denverYmd(ms = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DENVER,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(ms))
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const d = parts.find((p) => p.type === 'day')?.value
  return `${y}-${m}-${d}`
}

/** Monday YYYY-MM-DD (Denver) of the week containing `refMs`. */
function mondayYmdOfWeekContaining(refMs = Date.now()) {
  const ymd = denverYmd(refMs)
  const [y, mo, da] = ymd.split('-').map(Number)
  const utcNoon = Date.UTC(y, mo - 1, da, 12, 0, 0)
  const wd = new Intl.DateTimeFormat('en-US', {
    timeZone: DENVER,
    weekday: 'short',
  }).format(new Date(utcNoon))
  const backFromMon = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }
  const off = backFromMon[wd] ?? 0
  return addDaysYmd(ymd, -off)
}

function ymdFromMsInDenver(ms) {
  return denverYmd(ms)
}

function addDaysYmd(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/**
 * MM/DD (current Denver year) → YYYY-MM-DD Denver.
 * @param {string} mmdd e.g. "04/15" or "4/15"
 */
function parseMmDdToYmd(mmdd, refMs = Date.now()) {
  const s = String(mmdd || '').trim()
  const m = s.match(/^(\d{1,2})\/(\d{1,2})$/)
  if (!m) return null
  const month = Number(m[1])
  const day = Number(m[2])
  if (!Number.isFinite(month) || !Number.isFinite(day) || month < 1 || month > 12 || day < 1 || day > 31)
    return null
  const y = Number(denverYmd(refMs).slice(0, 4))
  const dt = new Date(y, month - 1, day)
  if (dt.getMonth() !== month - 1 || dt.getDate() !== day) return null
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${y}-${mm}-${dd}`
}

const OP_START = 8
const OP_END = 18

/** Hour blocks [8..17] — each block is hour h = [h, h+1). */
function operatingHours() {
  const out = []
  for (let h = OP_START; h < OP_END; h += 1) out.push(h)
  return out
}

/**
 * "2pm", "4pm", "10am", "12:30pm" → hour 0–23 (fractional rounded down for minutes).
 */
function parseClockToHour(clock) {
  const s = String(clock || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/)
  if (!m) return null
  let hh = Number(m[1])
  const mm = Number(m[2] || 0)
  const ap = m[3]
  if (!Number.isFinite(hh) || hh < 1 || hh > 12) return null
  if (ap === 'am') {
    if (hh === 12) hh = 0
  } else {
    if (hh !== 12) hh += 12
  }
  if (mm >= 30) hh = Math.min(23, hh + 1)
  return hh
}

/**
 * "2pm-4pm" → { startH, endH } half-open [startH, endH) in whole hours.
 */
function parseWindowToHourRange(windowStr) {
  const s = String(windowStr || '').trim()
  const parts = s.split(/\s*[-–—]\s*/)
  if (parts.length < 2) return null
  const a = parseClockToHour(parts[0])
  const b = parseClockToHour(parts[1])
  if (a == null || b == null) return null
  const startH = Math.min(a, b)
  let endH = Math.max(a, b)
  if (endH <= startH) endH = Math.min(OP_END, startH + 1)
  else endH = Math.max(startH + 1, endH)
  return { startH, endH }
}

function hourRangeForOrder(order) {
  const w = order.scheduledWindow || order.fulfillmentScheduledTime || order.scheduledTime || ''
  const r = parseWindowToHourRange(String(w))
  if (r) return r
  return null
}

/** Hours in [OP_START, OP_END) touched by [startH, endH). */
function clampedHourSet(startH, endH) {
  const set = new Set()
  const lo = Math.max(OP_START, startH)
  const hi = Math.min(OP_END, endH)
  for (let h = lo; h < hi; h += 1) set.add(h)
  return set
}

function orderBlocksHours(order) {
  const r = hourRangeForOrder(order)
  if (!r) return new Set()
  return clampedHourSet(r.startH, r.endH)
}

function blocksFromSlots(blockedSlots) {
  const set = new Set()
  if (!Array.isArray(blockedSlots)) return set
  for (const b of blockedSlots) {
    const start = Number(b?.start)
    const end = Number(b?.end)
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    for (const h of clampedHourSet(start, end)) set.add(h)
  }
  return set
}

function orderAppliesToCrew(order, crewUid, djUid) {
  const u = String(order.scheduledCrewUid || '').trim()
  if (u) return u === crewUid
  if (djUid && crewUid === djUid) return true
  return false
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 */
async function resolveDjUid(db) {
  const snap = await db.collection('meta').doc('scheduleSettings').get()
  const id = snap.exists ? String(snap.data()?.djUserId || '').trim() : ''
  if (id) return id
  return String(process.env.DJ_SCHEDULE_UID || '').trim()
}

async function fetchAvailabilityDay(db, crewUid, ymd) {
  const ref = db.collection('users').doc(crewUid).collection('availability').doc(ymd)
  const snap = await ref.get()
  if (!snap.exists) return { ref, data: { blockedSlots: [] } }
  const data = snap.data() || {}
  return {
    ref,
    data: {
      blockedSlots: Array.isArray(data.blockedSlots) ? data.blockedSlots : [],
    },
  }
}

/**
 * Orders with scheduledDate in [startYmd, endYmd] (string inclusive).
 */
async function fetchOrdersScheduledInRange(db, startYmd, endYmd) {
  const snap = await db
    .collection('orders')
    .where('scheduledDate', '>=', startYmd)
    .where('scheduledDate', '<=', endYmd)
    .limit(400)
    .get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

module.exports = {
  DENVER,
  denverYmd,
  ymdFromMsInDenver,
  mondayYmdOfWeekContaining,
  addDaysYmd,
  parseMmDdToYmd,
  operatingHours,
  parseClockToHour,
  parseWindowToHourRange,
  hourRangeForOrder,
  orderBlocksHours,
  blocksFromSlots,
  orderAppliesToCrew,
  resolveDjUid,
  fetchAvailabilityDay,
  fetchOrdersScheduledInRange,
  OP_START,
  OP_END,
}
