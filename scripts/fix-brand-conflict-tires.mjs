/**
 * One-off hotfix for the two MSPNs that the eFleet importer corrupted on
 * 2026-04-29 because they're duplicated across both BFGoodrich and Michelin
 * sections in Michelin's eFleet HTML report.
 *
 * Original brand `BFGOODRICH` was preserved (importer's brandConflicts safeguard
 * worked), but description, price, fet, and tread were overwritten with the
 * Michelin-section line because the importer parsed the HTML last-seen-wins.
 * Result: brand says BFG but description / buy / etc. are Michelin's product.
 *
 * This script restores the BFG-section truth for both rows and clears the
 * stale priceIntel.retailPrice / priceIntel.lastResearched so the catchup cron
 * re-researches retail against the correct description.
 *
 * Usage:
 *   node scripts/fix-brand-conflict-tires.mjs --dry-run
 *   node scripts/fix-brand-conflict-tires.mjs
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

const PROJECT_ID = 'skedaddle-inventory'

// BFG-section truth from Michelin eFleet HTML, 2026-04-29 export.
const FIXES = [
  {
    id: '54802',
    brand: 'BFGOODRICH',
    description: '42X14.50R17LT 128Q MDTRTA KM3 D',
    tread: 'MDTRTA KM3',
    lr: 'E',
    fet: 4.44,
    price: 686.40,
  },
  {
    id: '61309',
    brand: 'BFGOODRICH',
    description: '265/70R17 115S TL TRTERTA GO',
    tread: 'TRTERTA',
    lr: '',
    fet: 0,
    price: 163.80,
  },
]

function parseArgs(argv) {
  const out = { dryRun: false, serviceAccountPath: null }
  const args = [...argv]
  while (args.length) {
    const a = args.shift()
    if (a === '--dry-run' || a === '-n') out.dryRun = true
    else if (a === '--service-account' && args[0]) out.serviceAccountPath = resolve(args.shift())
  }
  return out
}

function initFirebase(serviceAccountPath) {
  if (getApps().length) return
  if (serviceAccountPath) {
    const json = JSON.parse(readFileSync(serviceAccountPath, 'utf8'))
    initializeApp({ credential: cert(json), projectId: PROJECT_ID })
    return
  }
  initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID })
}

async function main() {
  const { dryRun, serviceAccountPath } = parseArgs(process.argv.slice(2))
  initFirebase(serviceAccountPath)
  const db = getFirestore()

  console.log(`Target Firestore project: ${PROJECT_ID}`)
  console.log(`Mode: ${dryRun ? 'dry-run (no writes)' : 'WRITE'}`)
  console.log('')

  for (const fix of FIXES) {
    const ref = db.collection('tires').doc(fix.id)
    const snap = await ref.get()
    if (!snap.exists) {
      console.log(`tires/${fix.id} -> MISSING (no doc), skipping`)
      continue
    }
    const before = snap.data() || {}
    console.log(`tires/${fix.id}`)
    console.log(`  before:`)
    console.log(`    brand=${before.brand}  description=${before.description}`)
    console.log(`    price=${before.price}  fet=${before.fet}  lr=${before.lr}  tread=${before.tread}`)
    console.log(`    priceIntel.retailPrice=${before.priceIntel?.retailPrice ?? '(unset)'}`)
    console.log(`  after:`)
    console.log(`    brand=${fix.brand}  description=${fix.description}`)
    console.log(`    price=${fix.price}  fet=${fix.fet}  lr=${fix.lr}  tread=${fix.tread}`)
    console.log(`    priceIntel.retailPrice=(deleted)  priceIntel.lastResearched=(deleted)`)

    if (dryRun) {
      console.log('  [dry-run] no write')
      console.log('')
      continue
    }

    await ref.update({
      brand: fix.brand,
      description: fix.description,
      tread: fix.tread,
      lr: fix.lr,
      fet: fix.fet,
      price: fix.price,
      'priceIntel.retailPrice': FieldValue.delete(),
      'priceIntel.lastResearched': FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    console.log('  WROTE')
    console.log('')
  }

  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
