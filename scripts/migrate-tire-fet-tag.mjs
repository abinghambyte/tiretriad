/**
 * One-off: set `hasFet` on every tire doc that does not already have the field.
 * Idempotent: re-run skips docs that already carry `hasFet` (any value).
 *
 * Prerequisites:
 *   Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON path
 *   (Firebase Console -> Settings -> Service accounts -> Generate new private key).
 *
 * Run:
 *   node scripts/migrate-tire-fet-tag.mjs --dry-run
 *   node scripts/migrate-tire-fet-tag.mjs --yes
 */

import { existsSync, readFileSync } from 'node:fs'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { resolve, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { FieldPath, getFirestore } from 'firebase-admin/firestore'

/**
 * @param {Record<string, unknown> | null | undefined} doc
 * @returns {boolean | null} `null` means skip (doc already has `hasFet` field).
 */
export function classifyHasFet(doc) {
  if (!doc || typeof doc !== 'object') return false
  if (Object.prototype.hasOwnProperty.call(doc, 'hasFet')) return null
  return Number(doc.fet) > 0
}

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

async function confirmWrite(message) {
  const rl = readline.createInterface({ input, output })
  try {
    const ans = await rl.question(message)
    return String(ans || '').trim().toLowerCase() === 'y'
  } finally {
    rl.close()
  }
}

function isExecutedDirectly() {
  const entry = process.argv[1]
  if (!entry) return false
  return normalize(fileURLToPath(import.meta.url)) === normalize(resolve(entry))
}

async function main() {
  const { dryRun, yes } = parseArgs(process.argv.slice(2))
  const credPath = requireCredentialsPath()
  initFirebase(credPath)
  const db = getFirestore()
  const projectId = db.app?.options?.projectId || '(unknown)'

  let scanned = 0
  let skipHasField = 0
  let wouldTrue = 0
  let wouldFalse = 0
  let lastDoc = null

  console.log('--- migrate-tire-fet-tag: start ---')
  console.log(`projectId=${projectId} dryRun=${dryRun}`)

  for (;;) {
    let q = db.collection('tires').orderBy(FieldPath.documentId()).limit(500)
    if (lastDoc) q = q.startAfter(lastDoc)
    const snap = await q.get()
    if (snap.empty) break

    for (const doc of snap.docs) {
      scanned += 1
      const data = doc.data() || {}
      const classified = classifyHasFet(data)
      if (classified === null) {
        skipHasField += 1
      } else if (classified) {
        wouldTrue += 1
      } else {
        wouldFalse += 1
      }

      if (scanned % 200 === 0) {
        console.log(`progress: scanned ${scanned} tire docs`)
      }
    }

    lastDoc = snap.docs[snap.docs.length - 1]
    if (snap.size < 500) break
  }

  const toWrite = wouldTrue + wouldFalse
  console.log(
    `classification: wouldSetHasFetTrue=${wouldTrue} wouldSetHasFetFalse=${wouldFalse} skipAlreadyHasHasFet=${skipHasField} totalScanned=${scanned}`,
  )

  if (dryRun) {
    console.log('[dry-run] no write performed.')
    console.log('--- migrate-tire-fet-tag: end ---')
    return
  }

  if (toWrite === 0) {
    console.log(`Updated 0, skipped ${skipHasField} (already had hasFet)`)
    console.log('--- migrate-tire-fet-tag: end ---')
    return
  }

  if (!yes) {
    const ok = await confirmWrite(
      `This will add hasFet to ${toWrite} tires (${wouldTrue} true, ${wouldFalse} false). Continue? (y/N) `,
    )
    if (!ok) {
      console.log('Aborted (no write).')
      return
    }
  }

  let updated = 0
  let scannedWrite = 0
  lastDoc = null
  for (;;) {
    let q = db.collection('tires').orderBy(FieldPath.documentId()).limit(500)
    if (lastDoc) q = q.startAfter(lastDoc)
    const snap = await q.get()
    if (snap.empty) break

    let batch = db.batch()
    let ops = 0

    for (const doc of snap.docs) {
      scannedWrite += 1
      const classified = classifyHasFet(doc.data() || {})
      if (classified === null) continue
      batch.set(doc.ref, { hasFet: classified }, { merge: true })
      ops += 1
      updated += 1
      if (ops >= 500) {
        await batch.commit()
        batch = db.batch()
        ops = 0
      }
    }

    if (ops > 0) await batch.commit()

    if (scannedWrite % 200 === 0) {
      console.log(`progress: write pass scanned ${scannedWrite} tire docs`)
    }

    lastDoc = snap.docs[snap.docs.length - 1]
    if (snap.size < 500) break
  }

  console.log(`Updated ${updated}, skipped ${skipHasField} (already had hasFet)`)
  console.log('--- migrate-tire-fet-tag: end ---')
}

if (isExecutedDirectly()) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
