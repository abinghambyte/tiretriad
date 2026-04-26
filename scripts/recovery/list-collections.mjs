/**
 * scripts/recovery/list-collections.mjs
 *
 * Diagnostic: lists every top-level collection in BOTH the recovery and live
 * databases with doc counts, so we can find the ~58 docs the 6-collection
 * diff didn't account for.
 *
 * Run:  node scripts/recovery/list-collections.mjs
 */

import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const PROJECT_ID = 'skedaddle-inventory'
const RECOVERY_DB = 'recovery-2026-04-25'

function makeApp(name) {
  return (
    getApps().find((a) => a.name === name) ||
    initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID }, name)
  )
}

const liveDb = getFirestore(makeApp('live'))
const recoveryDb = getFirestore(makeApp('recovery'), RECOVERY_DB)

async function listWithCounts(db, label) {
  const cols = await db.listCollections()
  console.log(`\n=== ${label} (${cols.length} collections) ===`)
  const rows = []
  for (const c of cols) {
    const snap = await c.count().get()
    rows.push({ name: c.id, count: snap.data().count })
  }
  rows.sort((a, b) => b.count - a.count)
  let total = 0
  for (const r of rows) {
    console.log(`  ${r.count.toString().padStart(6)}  ${r.name}`)
    total += r.count
  }
  console.log(`  ------  ----------`)
  console.log(`  ${total.toString().padStart(6)}  TOTAL`)
}

async function main() {
  await listWithCounts(recoveryDb, 'RECOVERY (recovery-2026-04-25)')
  await listWithCounts(liveDb, 'LIVE ((default))')
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
