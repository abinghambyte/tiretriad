/**
 * One-off: delete every document in `orders` and reset `meta/revenueStats`
 * to the zeroed default so the Dashboard's Recent Activity, Pending Orders,
 * and Last Sale cards start from a clean slate. Intended for clearing test
 * data before real sales begin. Does not touch `tires`, `crmAccounts`, or
 * any other collection.
 *
 * Prerequisites:
 *   Set GOOGLE_APPLICATION_CREDENTIALS to a JSON key file path (Firebase
 *   Console -> Settings -> Service accounts -> Generate new private key).
 *
 * Run:
 *   node scripts/wipe-test-orders.mjs --dry-run
 *   node scripts/wipe-test-orders.mjs --yes
 */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { resolve } from 'node:path'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const require = createRequire(import.meta.url)
const { defaultRevenueDoc } = require('../functions/financeStats.js')

const BATCH_SIZE = 400

function parseArgs(argv) {
  const out = { dryRun: false, yes: false }
  for (const a of argv) {
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

async function countOrders(db) {
  const snap = await db.collection('orders').count().get()
  return snap.data().count
}

async function deleteAllOrders(db) {
  let total = 0
  // Paginate to avoid holding all docs in memory.
  for (;;) {
    const qs = await db.collection('orders').limit(BATCH_SIZE).get()
    if (qs.empty) return total
    const batch = db.batch()
    qs.docs.forEach((d) => batch.delete(d.ref))
    await batch.commit()
    total += qs.size
    console.log(`  deleted ${total} orders so far...`)
    if (qs.size < BATCH_SIZE) return total
  }
}

async function confirmWrite(orderCount) {
  const rl = readline.createInterface({ input, output })
  try {
    const ans = await rl.question(
      `This will DELETE ${orderCount} orders and reset meta/revenueStats to zero. Continue? (y/N) `,
    )
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
  const projectId = db.app?.options?.projectId || '(unknown)'

  const orderCount = await countOrders(db)

  console.log('--- wipe-test-orders: start ---')
  console.log(`projectId=${projectId}`)
  console.log(`ordersToDelete=${orderCount}`)
  console.log(`dryRun=${dryRun}`)

  if (dryRun) {
    console.log('[dry-run] would delete all orders and reset meta/revenueStats.')
    return
  }

  if (!yes) {
    const ok = await confirmWrite(orderCount)
    if (!ok) {
      console.log('Aborted (no write).')
      return
    }
  }

  if (orderCount > 0) {
    const deleted = await deleteAllOrders(db)
    console.log(`Deleted ${deleted} orders.`)
  } else {
    console.log('No orders to delete.')
  }

  await db.collection('meta').doc('revenueStats').set(defaultRevenueDoc())
  console.log('Reset meta/revenueStats to zeroed default.')

  const remaining = await countOrders(db)
  console.log(`remainingOrders=${remaining}`)
  console.log('--- wipe-test-orders: end ---')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
