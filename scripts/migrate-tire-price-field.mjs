/**
 * One-shot migration: move every tire doc's top-level `retailPrice` field
 * into the canonical `price` field and delete the `retailPrice` field.
 *
 * Why: the CSV importer previously wrote Kyle's buy cost into a field named
 * `retailPrice`, which violated the project convention documented in
 * AGENTS.md (`price` is the canonical buy-cost field; `retailPrice` does not
 * exist on tire docs). That caused `tireCatalogRetailNumber` to fall back to
 * buy cost for unresearched tires and display it as retail in the catalog,
 * zeroing out the margin column for every un-researched tire.
 *
 * Safety:
 *   - Skips tires that already have `price > 0` set (does not overwrite).
 *   - Still deletes the bogus `retailPrice` field in that case so the data
 *     model is clean after this pass.
 *   - Runs in batches of 400 (Firestore batch-write limit is 500).
 *   - Idempotent: running it twice has no additional effect.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./keys/skedaddle-admin.json \
 *     node scripts/migrate-tire-price-field.mjs
 *
 *   or explicit:
 *   node scripts/migrate-tire-price-field.mjs --service-account ./keys/skedaddle-admin.json
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  cert,
  getApps,
  initializeApp,
  applicationDefault,
} from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

const PROJECT_ID = 'skedaddle-inventory'

function parseArgs(argv) {
  const out = { serviceAccountPath: null, dryRun: false }
  const args = [...argv]
  while (args.length) {
    const a = args.shift()
    if (a === '--service-account' && args[0]) {
      out.serviceAccountPath = resolve(args.shift())
    } else if (a === '--dry-run' || a === '-n') {
      out.dryRun = true
    }
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

async function run({ serviceAccountPath, dryRun }) {
  initFirebase(serviceAccountPath)
  const db = getFirestore()
  const col = db.collection('tires')

  const snap = await col.select('price', 'retailPrice').get()
  const total = snap.size
  let hadRetailPrice = 0
  let willCopy = 0
  let willDelete = 0
  let skipped = 0

  const ops = []
  for (const doc of snap.docs) {
    const data = doc.data() || {}
    const legacy = Number(data.retailPrice)
    const existingPrice = Number(data.price)
    const hasLegacy = Number.isFinite(legacy) && legacy > 0
    const hasPrice = Number.isFinite(existingPrice) && existingPrice > 0
    if (!hasLegacy && !hasPrice) {
      skipped += 1
      continue
    }
    if (hasLegacy) hadRetailPrice += 1
    const update = {}
    if (hasLegacy && !hasPrice) {
      update.price = legacy
      willCopy += 1
    }
    if (hasLegacy) {
      update.retailPrice = FieldValue.delete()
      willDelete += 1
    }
    if (Object.keys(update).length > 0) {
      ops.push({ ref: doc.ref, update })
    }
  }

  console.log(
    `Scan complete: ${total} tire docs, ${hadRetailPrice} had legacy retailPrice, ` +
      `${willCopy} need price copy, ${willDelete} need retailPrice delete, ${skipped} already clean.`,
  )

  if (dryRun) {
    console.log('DRY RUN — no writes.')
    return
  }

  const CHUNK = 400
  let written = 0
  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = db.batch()
    for (const op of ops.slice(i, i + CHUNK)) {
      batch.update(op.ref, op.update)
    }
    await batch.commit()
    written += Math.min(CHUNK, ops.length - i)
    console.log(`Committed ${written} / ${ops.length}…`)
  }
  console.log(`Migration complete. Updated ${ops.length} tire docs.`)
}

run(parseArgs(process.argv.slice(2))).catch((err) => {
  console.error(err)
  process.exit(1)
})
