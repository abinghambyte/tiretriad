/**
 * One-off: rebuild `meta/revenueStats` from all completed orders (chronological).
 * Does not auto-run. Ops invokes manually with a service account.
 *
 * Prerequisites:
 *   Set GOOGLE_APPLICATION_CREDENTIALS to a JSON key file path (Firebase Console:
 *   Settings -> Service accounts -> Generate new private key).
 *
 * Run:
 *   node scripts/backfill-revenue-stats.mjs --dry-run
 *   node scripts/backfill-revenue-stats.mjs --yes
 */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { resolve } from 'node:path'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const require = createRequire(import.meta.url)
const {
  bumpRevenueFields,
  buyPerTireFromOrderAndTire,
  ctsPerTire,
  defaultRevenueDoc,
  round2,
} = require('../functions/financeStats.js')

function parseArgs(argv) {
  const out = { dryRun: false, yes: false }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--dry-run' || a === '-n') out.dryRun = true
    else if (a === '--yes') out.yes = true
  }
  return out
}

function requireCredentialsPath() {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!raw || !String(raw).trim()) {
    console.error(
      'Missing GOOGLE_APPLICATION_CREDENTIALS. Set it to the path of your service account JSON key file.',
    )
    console.error(
      'Generate a key: Firebase Console -> Settings -> Service accounts -> Generate new private key.',
    )
    process.exit(1)
  }
  const p = resolve(String(raw).trim())
  if (!existsSync(p)) {
    console.error(`GOOGLE_APPLICATION_CREDENTIALS file not found: ${p}`)
    process.exit(1)
  }
  return p
}

function initFirebase(serviceAccountPath) {
  if (getApps().length) return
  const json = JSON.parse(readFileSync(serviceAccountPath, 'utf8'))
  const projectId = json.project_id
  if (!projectId) {
    console.error('Service account JSON missing project_id.')
    process.exit(1)
  }
  initializeApp({ credential: cert(json), projectId })
}

function completedMsFromOrder(data) {
  const ca = data?.completedAt
  if (ca && typeof ca.toMillis === 'function') return ca.toMillis()
  return 0
}

function paymentFromOrder(data) {
  return Number(data?.paymentAmount ?? data?.totalPrice) || 0
}

function snapshotNumericFields(doc) {
  const skip = new Set(['updatedAt'])
  const out = {}
  for (const [k, v] of Object.entries(doc || {})) {
    if (skip.has(k)) continue
    if (typeof v === 'number' || typeof v === 'string') out[k] = v
  }
  return out
}

async function loadCompletedOrders(db) {
  const qs = await db
    .collection('orders')
    .where('status', '==', 'completed')
    .orderBy('completedAt', 'asc')
    .get()
  return qs.docs
}

async function tireDataForOrder(db, cache, orderData) {
  const mspn = String(orderData.mspn || '').trim()
  if (!mspn) return {}
  if (cache.has(mspn)) return cache.get(mspn)
  const snap = await db.collection('tires').doc(mspn).get()
  const data = snap.exists ? snap.data() || {} : {}
  cache.set(mspn, data)
  return data
}

function costAndMarginForOrder(orderData, tireData, pay) {
  const qty = Number(orderData.quantity) || 0
  const buy = buyPerTireFromOrderAndTire(orderData, tireData)
  const cts = ctsPerTire(tireData)
  const costTotal = round2((buy + cts) * qty)
  const marginTotal = round2(pay - costTotal)
  return { costTotal, marginTotal }
}

async function confirmWrite() {
  const rl = readline.createInterface({ input, output })
  try {
    const ans = await rl.question('This will overwrite meta/revenueStats. Continue? (y/N) ')
    return String(ans || '').trim().toLowerCase() === 'y'
  } finally {
    rl.close()
  }
}

async function main() {
  const { dryRun, yes } = parseArgs(process.argv.slice(2))
  const credPath = requireCredentialsPath()
  initFirebase(credPath)
  const db = getFirestore()

  const docs = await loadCompletedOrders(db)
  const projectId = db.app?.options?.projectId || '(unknown)'

  let minMs = Infinity
  let maxMs = -Infinity
  for (const d of docs) {
    const ms = completedMsFromOrder(d.data())
    if (ms > 0) {
      minMs = Math.min(minMs, ms)
      maxMs = Math.max(maxMs, ms)
    }
  }
  const rangeLabel =
    minMs !== Infinity ? `${new Date(minMs).toISOString()} .. ${new Date(maxMs).toISOString()}` : 'n/a'

  console.log('--- backfill-revenue-stats: start ---')
  console.log(`projectId=${projectId}`)
  console.log(`completedOrdersQueried=${docs.length}`)
  console.log(`completedAtRange=${rangeLabel}`)
  console.log(`dryRun=${dryRun}`)

  let rev = {}
  let folded = 0
  let skippedZeroTime = 0
  let skippedNonPositivePay = 0
  let lastFoldedMs = 0
  const tireCache = new Map()

  for (let i = 0; i < docs.length; i += 1) {
    const doc = docs[i]
    const data = doc.data() || {}
    const completedMs = completedMsFromOrder(data)
    if (!completedMs) {
      skippedZeroTime += 1
      console.warn(`skip order ${doc.id}: missing or invalid completedAt`)
      continue
    }
    const rawPay = paymentFromOrder(data)
    if (rawPay <= 0) {
      skippedNonPositivePay += 1
      continue
    }
    const pay = round2(rawPay)
    const tireData = await tireDataForOrder(db, tireCache, data)
    const { costTotal, marginTotal } = costAndMarginForOrder(data, tireData, pay)
    rev = bumpRevenueFields(rev, pay, costTotal, marginTotal, completedMs)
    folded += 1
    lastFoldedMs = completedMs

    const n = i + 1
    if (n % 50 === 0 || n === docs.length) {
      console.log(`progress: processed ${n}/${docs.length} docs, folded ${folded} orders`)
    }
  }
  if (!docs.length) {
    console.log('progress: processed 0/0 docs, folded 0 orders')
  }

  console.log('--- fold complete ---')
  console.log(`foldedOrders=${folded} skippedNoCompletedAt=${skippedZeroTime} skippedNonPositivePayment=${skippedNonPositivePay}`)
  if (!folded) {
    rev = defaultRevenueDoc()
  }
  console.log('finalNumericSnapshot=', snapshotNumericFields(rev))
  console.log(`mostRecentFoldedOrderCompletedAt=${lastFoldedMs ? new Date(lastFoldedMs).toISOString() : 'n/a'}`)

  if (dryRun) {
    console.log('[dry-run] no write performed.')
    return
  }

  if (!yes) {
    const ok = await confirmWrite()
    if (!ok) {
      console.log('Aborted (no write).')
      return
    }
  }

  await db.collection('meta').doc('revenueStats').set(rev)
  console.log('Write complete: meta/revenueStats')
  console.log('Rerun with --dry-run to verify idempotency')
  console.log('--- backfill-revenue-stats: end ---')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
