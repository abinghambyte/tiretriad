/**
 * One-off: set users/{uid}.crewKey for the three real crew members so
 * acknowledgeAdjustment + PeopleEarningsPage can map auth.uid -> crewKey
 * without falling back to displayName matching.
 *
 * Edit the UID_TO_CREW_KEY map below with the real Firebase Auth UIDs
 * before running, then:
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json \
 *   node scripts/seed-crew-keys.mjs --dry-run
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=... node scripts/seed-crew-keys.mjs --yes
 *
 * Idempotent: re-running on a doc that already has the correct crewKey is a
 * no-op. Will refuse to overwrite a different crewKey unless --force.
 */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

// EDIT THIS - real auth UIDs from the Firebase console
const UID_TO_CREW_KEY = {
  // 'replace-with-alex-uid': 'alex',
  // 'replace-with-dj-uid':   'dj',
  // 'replace-with-kyle-uid': 'kyle',
}

function parseArgs(argv) {
  const out = { dryRun: false, yes: false, force: false }
  for (const a of argv) {
    if (a === '--dry-run' || a === '-n') out.dryRun = true
    else if (a === '--yes') out.yes = true
    else if (a === '--force') out.force = true
  }
  return out
}

function requireCredentialsPath() {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!raw || !String(raw).trim()) {
    console.error('Missing GOOGLE_APPLICATION_CREDENTIALS. Set it to the service account JSON path.')
    process.exit(1)
  }
  const p = resolve(String(raw).trim())
  if (!existsSync(p)) {
    console.error(`Credentials file not found: ${p}`)
    process.exit(1)
  }
  return p
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.dryRun && !args.yes) {
    console.error('Pass --dry-run to preview or --yes to commit.')
    process.exit(1)
  }
  if (Object.keys(UID_TO_CREW_KEY).length === 0) {
    console.error('UID_TO_CREW_KEY is empty. Edit the script with the real UIDs first.')
    process.exit(1)
  }

  const credPath = requireCredentialsPath()
  if (!getApps().length) {
    initializeApp({ credential: cert(credPath) })
  }
  const db = getFirestore()

  let writes = 0
  let skipped = 0
  let conflicts = 0
  for (const [uid, expected] of Object.entries(UID_TO_CREW_KEY)) {
    const ref = db.collection('users').doc(uid)
    const snap = await ref.get()
    if (!snap.exists) {
      console.error(`users/${uid} does not exist; skipping`)
      continue
    }
    const data = snap.data() || {}
    const current = data.crewKey
    if (current === expected) {
      console.log(`users/${uid}: already ${expected}`)
      skipped += 1
      continue
    }
    if (typeof current === 'string' && current !== expected && !args.force) {
      console.error(`users/${uid}: existing crewKey ${current} != ${expected}; pass --force to overwrite`)
      conflicts += 1
      continue
    }
    if (args.dryRun) {
      console.log(`[dry-run] users/${uid}: would set crewKey = ${expected}`)
      writes += 1
      continue
    }
    await ref.update({
      crewKey: expected,
      crewKeySetAt: FieldValue.serverTimestamp(),
    })
    console.log(`users/${uid}: set crewKey = ${expected}`)
    writes += 1
  }
  console.log(`\nDone. ${writes} write${writes === 1 ? '' : 's'}, ${skipped} skipped, ${conflicts} conflict${conflicts === 1 ? '' : 's'}.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
