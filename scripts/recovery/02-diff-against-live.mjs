/**
 * scripts/recovery/02-diff-against-live.mjs
 *
 * Phase 2 of wipe recovery (2026-04-25 customer data wipe).
 *
 * Connects to BOTH the recovery database (`recovery-2026-04-25`) and the
 * live database (`(default)`). For every collection we care about, computes:
 *
 *   missingInLive = docIDs in recovery − docIDs in live
 *   modifiedSinceWipe = docIDs in both, with different content
 *
 * Writes `recovery-manifest-2026-04-25.json` to scripts/recovery/ for human
 * review before any production write.
 *
 * Default mode is DRY-RUN-FRIENDLY: reads only, writes nothing back to
 * Firestore. The output JSON file is a local artifact, not a Firestore write.
 *
 * Run:
 *   node scripts/recovery/02-diff-against-live.mjs
 *   node scripts/recovery/02-diff-against-live.mjs --collections=orders,contacts
 *   node scripts/recovery/02-diff-against-live.mjs --verbose
 *
 * Auth: uses Application Default Credentials.
 *   $ gcloud auth application-default login
 */

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const PROJECT_ID = 'skedaddle-inventory'
const RECOVERY_DB = 'recovery-2026-04-25'
const LIVE_DB = '(default)'

// Collections to diff. Edit if recovery scope changes. The wipe targeted
// `orders`; sibling collections that may have lost referential data are
// included defensively (the diff will report 0 if they're unaffected).
const DEFAULT_COLLECTIONS = [
  'orders',
  'contacts',
  'crmAccounts',
  'crmVehicles',
  'tires',
  'users',
]

// --------------------------------------------------------------------------
// CLI parsing
// --------------------------------------------------------------------------
const args = process.argv.slice(2)
const VERBOSE = args.includes('--verbose')
const collectionsArg = args.find((a) => a.startsWith('--collections='))
const COLLECTIONS = collectionsArg
  ? collectionsArg.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean)
  : DEFAULT_COLLECTIONS

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_PATH = join(__dirname, 'recovery-manifest-2026-04-25.json')

// --------------------------------------------------------------------------
// Firestore connections — one app per database
// --------------------------------------------------------------------------
function makeApp(name, databaseId) {
  if (getApps().some((a) => a.name === name)) {
    return getApps().find((a) => a.name === name)
  }
  return initializeApp(
    {
      credential: applicationDefault(),
      projectId: PROJECT_ID,
    },
    name,
  )
}

const liveApp = makeApp('liveApp')
const recoveryApp = makeApp('recoveryApp')

const liveDb = getFirestore(liveApp) // (default)
const recoveryDb = getFirestore(recoveryApp, RECOVERY_DB)

// --------------------------------------------------------------------------
// Diff one collection
// --------------------------------------------------------------------------
async function listAllDocs(db, collectionPath) {
  const out = new Map()
  const snap = await db.collection(collectionPath).get()
  for (const doc of snap.docs) {
    out.set(doc.id, doc.data())
  }
  return out
}

function shallowEqual(a, b) {
  // Deep-equal-ish for plain JSON values. Firestore Timestamps/References
  // serialize differently across DBs; we don't care about cosmetic diffs,
  // only "data was modified after the wipe."
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
}

function canonical(v) {
  if (v === null || v === undefined) return null
  if (Array.isArray(v)) return v.map(canonical)
  if (typeof v === 'object') {
    // Firestore Timestamp → milliseconds for stable comparison
    if (typeof v.toMillis === 'function') return { _ts: v.toMillis() }
    // DocumentReference → path
    if (typeof v.path === 'string' && typeof v.id === 'string' && typeof v.parent === 'object') {
      return { _ref: v.path }
    }
    const out = {}
    for (const k of Object.keys(v).sort()) out[k] = canonical(v[k])
    return out
  }
  return v
}

function previewOf(data) {
  // Tight preview suitable for human eyeball in the manifest. Keep it short.
  if (!data) return null
  const keys = Object.keys(data).slice(0, 6)
  const out = {}
  for (const k of keys) {
    const v = data[k]
    if (v === null || v === undefined) {
      out[k] = v
    } else if (typeof v === 'string') {
      out[k] = v.length > 80 ? v.slice(0, 77) + '...' : v
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v
    } else if (typeof v?.toMillis === 'function') {
      out[k] = new Date(v.toMillis()).toISOString()
    } else if (Array.isArray(v)) {
      out[k] = `[array len=${v.length}]`
    } else if (typeof v === 'object') {
      out[k] = '[object]'
    } else {
      out[k] = String(v)
    }
  }
  return out
}

async function diffCollection(name) {
  process.stdout.write(`  ${name}... `)
  const [liveDocs, recoveryDocs] = await Promise.all([
    listAllDocs(liveDb, name),
    listAllDocs(recoveryDb, name),
  ])

  const missingInLive = []
  const modified = []
  const onlyInLive = [] // new docs created since wipe; informational only

  for (const [id, data] of recoveryDocs.entries()) {
    if (!liveDocs.has(id)) {
      missingInLive.push({ id, preview: previewOf(data) })
    } else if (!shallowEqual(data, liveDocs.get(id))) {
      modified.push({
        id,
        recoveryPreview: previewOf(data),
        livePreview: previewOf(liveDocs.get(id)),
      })
    }
  }

  for (const id of liveDocs.keys()) {
    if (!recoveryDocs.has(id)) {
      onlyInLive.push(id)
    }
  }

  console.log(
    `recovery=${recoveryDocs.size}  live=${liveDocs.size}  missingInLive=${missingInLive.length}  modified=${modified.length}  onlyInLive=${onlyInLive.length}`,
  )

  return {
    collection: name,
    counts: {
      recovery: recoveryDocs.size,
      live: liveDocs.size,
      missingInLive: missingInLive.length,
      modified: modified.length,
      onlyInLive: onlyInLive.length,
    },
    missingInLive,
    modified,
    onlyInLive: VERBOSE ? onlyInLive : onlyInLive.slice(0, 20),
  }
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------
async function main() {
  console.log('=== Phase 2: diff recovery vs. live ===')
  console.log(`project   : ${PROJECT_ID}`)
  console.log(`recovery  : ${RECOVERY_DB}`)
  console.log(`live      : ${LIVE_DB}`)
  console.log(`collections: ${COLLECTIONS.join(', ')}`)
  console.log('')

  const results = []
  for (const c of COLLECTIONS) {
    try {
      results.push(await diffCollection(c))
    } catch (err) {
      console.error(`  ${c}... FAILED: ${err.message}`)
      results.push({ collection: c, error: err.message })
    }
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    projectId: PROJECT_ID,
    recoveryDatabase: RECOVERY_DB,
    liveDatabase: LIVE_DB,
    backupSource: 'gs://skedaddle-inventory-firestore-backups/firestore/2026-04-25T091801Z',
    collections: results,
    summary: {
      totalMissingInLive: results.reduce(
        (acc, r) => acc + (r.counts?.missingInLive || 0),
        0,
      ),
      totalModified: results.reduce((acc, r) => acc + (r.counts?.modified || 0), 0),
    },
  }

  writeFileSync(OUT_PATH, JSON.stringify(manifest, null, 2))
  console.log('')
  console.log(`manifest written: ${OUT_PATH}`)
  console.log(`total docs missing from live: ${manifest.summary.totalMissingInLive}`)
  console.log(`total docs modified since wipe: ${manifest.summary.totalModified}`)
  console.log('')
  console.log('next: review the manifest, then run 03-cherry-pick.mjs')
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
