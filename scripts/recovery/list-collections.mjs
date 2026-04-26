/**
 * scripts/recovery/list-collections.mjs
 *
 * Diagnostic: lists every top-level collection in one or more Firestore
 * databases with doc counts. Used to verify what each daily backup contains.
 *
 * Default behavior (no args): lists recovery-2026-04-25 + (default).
 *
 * To compare an arbitrary DB against live:
 *   node scripts/recovery/list-collections.mjs --db=recovery-2026-04-24
 *
 * To list only one DB:
 *   node scripts/recovery/list-collections.mjs --db=recovery-2026-04-24 --no-live
 *
 * To list multiple comma-separated:
 *   node scripts/recovery/list-collections.mjs --db=recovery-2026-04-24,recovery-2026-04-25
 */

import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const PROJECT_ID = 'skedaddle-inventory'

const args = process.argv.slice(2)
const dbArg = args.find((a) => a.startsWith('--db='))
const NO_LIVE = args.includes('--no-live')
const DBS = dbArg
  ? dbArg.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean)
  : ['recovery-2026-04-25']

function makeApp(name) {
  return (
    getApps().find((a) => a.name === name) ||
    initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID }, name)
  )
}

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
  for (const dbName of DBS) {
    const db = getFirestore(makeApp(`db-${dbName}`), dbName)
    await listWithCounts(db, dbName)
  }
  if (!NO_LIVE) {
    const live = getFirestore(makeApp('live'))
    await listWithCounts(live, '(default) — LIVE')
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
