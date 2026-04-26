/**
 * scripts/recovery/03-cherry-pick.mjs
 *
 * Phase 3 of wipe recovery (2026-04-25 customer data wipe).
 *
 * Reads `recovery-manifest-2026-04-25.json` (produced by 02-diff-against-live.mjs)
 * and cherry-picks `missingInLive` docs back into the live `(default)` database.
 *
 * Each restored doc is stamped with provenance so future audits can trace it:
 *   restoredFrom    : '2026-04-25T091801Z'
 *   restoredAt      : serverTimestamp()
 *   restoredBy      : 'recovery-2026-04-25-script'
 *   _wasModified    : false        (modified-vs-fresh-add flag — false here, true if the
 *                                   manifest's `modified` set is restored)
 *
 * Idempotent: if a doc already exists in live, it is SKIPPED (we don't
 * overwrite live data with stale).
 *
 * Default mode is DRY RUN: prints the write plan, writes nothing.
 * Pass --apply to execute the writes.
 *
 * Run:
 *   node scripts/recovery/03-cherry-pick.mjs                      # dry run
 *   node scripts/recovery/03-cherry-pick.mjs --apply              # write missingInLive
 *   node scripts/recovery/03-cherry-pick.mjs --apply --include-modified
 *                                                                  # also restore modified
 *                                                                  # (DANGEROUS — overwrites live)
 *   node scripts/recovery/03-cherry-pick.mjs --apply --collections=orders,contacts
 *   node scripts/recovery/03-cherry-pick.mjs --apply --limit=10    # cap writes for sanity test
 *
 * Auth: Application Default Credentials.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

const PROJECT_ID = 'skedaddle-inventory'
const RECOVERY_DB = 'recovery-2026-04-25'
const SOURCE_LABEL = '2026-04-25T091801Z'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MANIFEST_PATH = join(__dirname, 'recovery-manifest-2026-04-25.json')

// --------------------------------------------------------------------------
// CLI
// --------------------------------------------------------------------------
const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const INCLUDE_MODIFIED = args.includes('--include-modified')
const limitArg = args.find((a) => a.startsWith('--limit='))
const LIMIT = limitArg ? Number.parseInt(limitArg.split('=')[1], 10) : Infinity
const collectionsArg = args.find((a) => a.startsWith('--collections='))
const COLLECTIONS_FILTER = collectionsArg
  ? new Set(collectionsArg.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean))
  : null

// --------------------------------------------------------------------------
// Firestore connections
// --------------------------------------------------------------------------
function makeApp(name) {
  if (getApps().some((a) => a.name === name)) {
    return getApps().find((a) => a.name === name)
  }
  return initializeApp(
    { credential: applicationDefault(), projectId: PROJECT_ID },
    name,
  )
}

const liveApp = makeApp('liveApp')
const recoveryApp = makeApp('recoveryApp')

const liveDb = getFirestore(liveApp)
const recoveryDb = getFirestore(recoveryApp, RECOVERY_DB)

// --------------------------------------------------------------------------
// Provenance stamp
// --------------------------------------------------------------------------
function stampProvenance(data, modifiedFlag) {
  return {
    ...data,
    restoredFrom: SOURCE_LABEL,
    restoredAt: FieldValue.serverTimestamp(),
    restoredBy: 'recovery-2026-04-25-script',
    _wasModified: !!modifiedFlag,
  }
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------
async function main() {
  console.log(`=== Phase 3: cherry-pick (${APPLY ? 'APPLY' : 'DRY RUN'}) ===`)
  console.log(`manifest: ${MANIFEST_PATH}`)
  console.log(`include-modified: ${INCLUDE_MODIFIED}`)
  if (LIMIT !== Infinity) console.log(`limit per collection: ${LIMIT}`)
  if (COLLECTIONS_FILTER) console.log(`collections filter: ${[...COLLECTIONS_FILTER].join(', ')}`)
  console.log('')

  // ---- 1. Load manifest ------------------------------------------------
  let manifest
  try {
    manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
  } catch (err) {
    console.error(`Could not read manifest at ${MANIFEST_PATH}.`)
    console.error('Run 02-diff-against-live.mjs first.')
    process.exit(1)
  }

  // ---- 2. Build write plan ---------------------------------------------
  const plan = []
  for (const c of manifest.collections || []) {
    if (c.error) {
      console.log(`(skip) ${c.collection}: had diff error — ${c.error}`)
      continue
    }
    if (COLLECTIONS_FILTER && !COLLECTIONS_FILTER.has(c.collection)) {
      console.log(`(skip) ${c.collection}: not in --collections filter`)
      continue
    }

    const adds = (c.missingInLive || []).slice(0, LIMIT).map((m) => ({
      type: 'add',
      collection: c.collection,
      id: m.id,
    }))
    plan.push(...adds)

    if (INCLUDE_MODIFIED) {
      const overwrites = (c.modified || []).slice(0, LIMIT).map((m) => ({
        type: 'overwrite',
        collection: c.collection,
        id: m.id,
      }))
      plan.push(...overwrites)
    }

    console.log(
      `  ${c.collection}: ${adds.length} adds${INCLUDE_MODIFIED ? `, ${(c.modified || []).slice(0, LIMIT).length} overwrites` : ''}`,
    )
  }

  console.log('')
  console.log(`total writes planned: ${plan.length}`)

  if (!APPLY) {
    console.log('')
    console.log('DRY RUN — no Firestore writes performed.')
    console.log('Re-run with --apply to write.')
    return
  }

  if (plan.length === 0) {
    console.log('')
    console.log('Nothing to do. Exiting.')
    return
  }

  // ---- 3. Execute writes (chunked + idempotent) ------------------------
  console.log('')
  console.log('writing to live...')

  let written = 0
  let skipped = 0
  let failed = 0

  // Process in batches of 50 to keep memory bounded; we use individual
  // .set() calls (not batch.commit) because reading source data + idempotency
  // checks are awaitable per-doc, and we want clean error isolation.
  const CHUNK = 50
  for (let i = 0; i < plan.length; i += CHUNK) {
    const chunk = plan.slice(i, i + CHUNK)
    await Promise.all(
      chunk.map(async (item) => {
        try {
          const liveRef = liveDb.collection(item.collection).doc(item.id)
          const recoveryRef = recoveryDb.collection(item.collection).doc(item.id)

          // Idempotency for adds: if doc exists in live, skip.
          if (item.type === 'add') {
            const existing = await liveRef.get()
            if (existing.exists) {
              skipped += 1
              return
            }
          }

          const recoverySnap = await recoveryRef.get()
          if (!recoverySnap.exists) {
            console.warn(
              `  warn: ${item.collection}/${item.id} not in recovery DB anymore — skipping`,
            )
            skipped += 1
            return
          }

          const stamped = stampProvenance(
            recoverySnap.data(),
            item.type === 'overwrite',
          )
          await liveRef.set(stamped, { merge: false })
          written += 1
        } catch (err) {
          failed += 1
          console.error(`  fail: ${item.collection}/${item.id} — ${err.message}`)
        }
      }),
    )
    process.stdout.write(`  ${Math.min(i + CHUNK, plan.length)}/${plan.length}\r`)
  }

  console.log('')
  console.log('')
  console.log(`=== summary ===`)
  console.log(`written : ${written}`)
  console.log(`skipped : ${skipped}  (already existed in live, or missing in recovery)`)
  console.log(`failed  : ${failed}`)
  console.log('')
  console.log('done.')
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
