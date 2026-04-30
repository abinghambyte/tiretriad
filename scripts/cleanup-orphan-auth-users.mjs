/**
 * Cleanup script: delete Firebase Auth users that have no corresponding
 * `users/{uid}` Firestore doc.
 *
 * Background: a partially-failed `createPortalUser` (auth.createUser
 * succeeded, then the Firestore batch failed or the request errored) can
 * leave a zombie account in Firebase Auth. The People table reads only
 * Firestore, so the zombie is invisible — but the next attempt to register
 * the same email fails with `auth/email-already-exists`.
 *
 * This script:
 *   1. Pages through every Firebase Auth user
 *   2. Checks if `users/{uid}` exists in Firestore
 *   3. Deletes the Auth user when the Firestore doc is missing (or has
 *      `inviteStatus !== 'active'` AND no `acceptedAt` AND no recent
 *      lastSeen, configurable via flags)
 *
 * The user currently signed into the portal is protected via a hard-coded
 * SAFE_UIDS guard (filled in via flag) and any Auth user whose Firestore doc
 * exists.
 *
 * Usage:
 *   node scripts/cleanup-orphan-auth-users.mjs --dry-run
 *   node scripts/cleanup-orphan-auth-users.mjs --safe-uid <your-uid> [...]
 *   node scripts/cleanup-orphan-auth-users.mjs --safe-uid <uid> --apply
 *
 * Defaults: dry-run unless `--apply` is passed. Always prints a per-user diff
 * before any delete.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

const PROJECT_ID = 'skedaddle-inventory'

function parseArgs(argv) {
  const out = {
    dryRun: true, // default safe
    apply: false,
    serviceAccountPath: null,
    safeUids: new Set(),
  }
  const args = [...argv]
  while (args.length) {
    const a = args.shift()
    if (a === '--dry-run' || a === '-n') {
      out.dryRun = true
      out.apply = false
    } else if (a === '--apply') {
      out.apply = true
      out.dryRun = false
    } else if (a === '--service-account' && args[0]) {
      out.serviceAccountPath = resolve(args.shift())
    } else if (a === '--safe-uid' && args[0]) {
      out.safeUids.add(args.shift())
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

async function main() {
  const { dryRun, apply, serviceAccountPath, safeUids } = parseArgs(process.argv.slice(2))
  initFirebase(serviceAccountPath)
  const auth = getAuth()
  const db = getFirestore()

  console.log(`Target Firestore project: ${PROJECT_ID}`)
  console.log(`Mode: ${apply ? 'APPLY (real deletes)' : 'dry-run (no writes)'}`)
  if (safeUids.size > 0) {
    console.log(`Safe UIDs (always preserved): ${[...safeUids].join(', ')}`)
  } else {
    console.log('Safe UIDs: none specified (use --safe-uid <your-uid> to protect your own account)')
  }
  console.log('')

  // Page through every Auth user.
  const allAuthUsers = []
  let nextPageToken = undefined
  do {
    const page = await auth.listUsers(1000, nextPageToken)
    allAuthUsers.push(...page.users)
    nextPageToken = page.pageToken
  } while (nextPageToken)

  console.log(`Total Firebase Auth users: ${allAuthUsers.length}`)

  const orphans = []
  const kept = []

  for (const u of allAuthUsers) {
    if (safeUids.has(u.uid)) {
      kept.push({ uid: u.uid, email: u.email, reason: 'safe-uid' })
      continue
    }
    const snap = await db.collection('users').doc(u.uid).get()
    if (snap.exists) {
      kept.push({ uid: u.uid, email: u.email, reason: 'has-firestore-doc' })
      continue
    }
    orphans.push({
      uid: u.uid,
      email: u.email || '(no-email)',
      displayName: u.displayName || '',
      disabled: u.disabled,
      createdAt: u.metadata?.creationTime || '',
      lastSignInAt: u.metadata?.lastSignInTime || '',
    })
  }

  console.log(`Kept: ${kept.length}`)
  console.log(`Orphans (no users/{uid} doc): ${orphans.length}`)
  const orphansWithEmail = orphans.filter((o) => o.email && o.email !== '(no-email)')
  console.log(`Orphans WITH an email (these are the actual createUser blockers): ${orphansWithEmail.length}`)
  console.log('')

  if (kept.length > 0) {
    console.log('Kept users (have Firestore users/{uid} doc):')
    for (const k of kept) {
      console.log(`  ${k.uid.padEnd(28)} ${(k.email || '(no-email)').padEnd(36)} ${k.reason}`)
    }
    console.log('')
  }

  if (orphans.length === 0) {
    console.log('No orphans. Nothing to clean up.')
    return
  }

  console.log('Orphan list:')
  for (const o of orphans) {
    console.log(
      `  ${o.uid.padEnd(28)} ${(o.email || '').padEnd(36)} ${o.disabled ? '[disabled]' : '          '} created ${o.createdAt} last-sign-in ${o.lastSignInAt}`,
    )
  }
  console.log('')

  if (!apply) {
    console.log('[dry-run] Re-run with --apply to delete the orphans.')
    return
  }

  for (const o of orphans) {
    try {
      await auth.deleteUser(o.uid)
      console.log(`DELETED  ${o.uid}  ${o.email}`)
    } catch (e) {
      const code = e?.errorInfo?.code || 'unknown'
      console.error(`FAILED   ${o.uid}  ${o.email}  (${code})`)
    }
  }
  console.log('')
  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
