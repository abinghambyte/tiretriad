/**
 * One-off: stamp `marginFloor` on every tire doc that lacks it. Reads the
 * default from `meta/payoutConfig.marginFloor`, falling back to 0.15.
 * Idempotent: re-running skips docs that already carry `marginFloor`.
 *
 * Prerequisites:
 *   Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON path
 *   (Firebase Console -> Settings -> Service accounts -> Generate new private key).
 *
 * Run:
 *   node scripts/backfill-margin-floor.mjs --dry-run
 *   node scripts/backfill-margin-floor.mjs --confirm
 */

import { existsSync, readFileSync } from 'node:fs'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { resolve, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { FieldPath, getFirestore } from 'firebase-admin/firestore'

const DEFAULT_MARGIN_FLOOR = 0.15

function parseArgs(argv) {
  const out = { dryRun: false, confirm: false }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--dry-run' || a === '-n') out.dryRun = true
    else if (a === '--confirm') out.confirm = true
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

async function confirmWrite(message) {
  const rl = readline.createInterface({ input, output })
  try {
    const ans = await rl.question(message)
    return String(ans || '').trim().toLowerCase() === 'y'
  } finally {
    rl.close()
  }
}

async function loadDefaultFloor(db) {
  try {
    const snap = await db.collection('meta').doc('payoutConfig').get()
    if (snap.exists) {
      const raw = Number(snap.data()?.marginFloor)
      if (Number.isFinite(raw) && raw > 0) return raw
    }
  } catch (e) {
    console.error('failed to read meta/payoutConfig.marginFloor:', e)
  }
  return DEFAULT_MARGIN_FLOOR
}

function isExecutedDirectly() {
  const entry = process.argv[1]
  if (!entry) return false
  return normalize(fileURLToPath(import.meta.url)) === normalize(resolve(entry))
}

async function main() {
  const { dryRun, confirm } = parseArgs(process.argv.slice(2))
  const credPath = requireCredentialsPath()
  initFirebase(credPath)
  const db = getFirestore()
  const projectId = db.app?.options?.projectId || '(unknown)'
  const defaultFloor = await loadDefaultFloor(db)

  let scanned = 0
  let toStamp = 0
  let alreadySet = 0
  let lastDoc = null

  console.log('--- backfill-margin-floor: start ---')
  console.log(`projectId=${projectId} defaultFloor=${defaultFloor} dryRun=${dryRun}`)

  for (;;) {
    let q = db.collection('tires').orderBy(FieldPath.documentId()).limit(500)
    if (lastDoc) q = q.startAfter(lastDoc)
    const snap = await q.get()
    if (snap.empty) break
    for (const doc of snap.docs) {
      scanned += 1
      const data = doc.data() || {}
      if (Object.prototype.hasOwnProperty.call(data, 'marginFloor')) {
        alreadySet += 1
      } else {
        toStamp += 1
      }
      if (scanned % 200 === 0) {
        console.log(`progress: scanned ${scanned} tire docs`)
      }
    }
    lastDoc = snap.docs[snap.docs.length - 1]
    if (snap.size < 500) break
  }

  console.log(
    `classification: wouldStamp=${toStamp} alreadyHasMarginFloor=${alreadySet} totalScanned=${scanned}`,
  )

  if (dryRun) {
    console.log('[dry-run] no write performed.')
    console.log('--- backfill-margin-floor: end ---')
    return
  }

  if (toStamp === 0) {
    console.log('Nothing to stamp — every tire already has marginFloor.')
    console.log('--- backfill-margin-floor: end ---')
    return
  }

  if (!confirm) {
    const ok = await confirmWrite(
      `This will write marginFloor=${defaultFloor} to ${toStamp} tires. Continue? (y/N) `,
    )
    if (!ok) {
      console.log('Aborted (no write).')
      return
    }
  }

  let updated = 0
  lastDoc = null
  for (;;) {
    let q = db.collection('tires').orderBy(FieldPath.documentId()).limit(500)
    if (lastDoc) q = q.startAfter(lastDoc)
    const snap = await q.get()
    if (snap.empty) break
    let batch = db.batch()
    let ops = 0
    for (const doc of snap.docs) {
      const data = doc.data() || {}
      if (Object.prototype.hasOwnProperty.call(data, 'marginFloor')) continue
      batch.set(doc.ref, { marginFloor: defaultFloor }, { merge: true })
      ops += 1
      updated += 1
      if (ops >= 400) {
        await batch.commit()
        batch = db.batch()
        ops = 0
      }
    }
    if (ops > 0) await batch.commit()
    lastDoc = snap.docs[snap.docs.length - 1]
    if (snap.size < 500) break
  }

  console.log(`Updated ${updated}, skipped ${alreadySet} (already had marginFloor)`)
  console.log('--- backfill-margin-floor: end ---')
}

if (isExecutedDirectly()) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
