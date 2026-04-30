/**
 * One-off purge for two soft-archived Firestore users that were left over
 * from the prior project this portal was built on top of. Their email
 * reservations in Firebase Auth still block re-registration.
 *
 * Targets:
 *   2W3KsijYVaf29Yug7GbExxIIQL32  alexbingham@skedaddleinc.com
 *   HpLTI35QbyZTekqeqt6KoisP1nf2  bingham@skedaddle.co
 *
 * The user `jrDGTqdpieSdjZ7KCp3tYkPjd4R2 (boydabingham@gmail.com)` is the
 * active admin and is hard-coded as protected (the script refuses to touch
 * it).
 *
 * Steps per target:
 *   1. Inspect references across Firestore (audits, orders, crew assignments,
 *      tireOrders, etc) — print what's tied to the uid so the operator can
 *      see the blast radius before --apply.
 *   2. Delete inviteTokens where uid == target.
 *   3. Delete Firestore users/{uid} doc.
 *   4. Delete Firebase Auth account.
 *
 * Usage:
 *   node scripts/purge-legacy-users.mjs                       # dry-run preview
 *   node scripts/purge-legacy-users.mjs --apply               # actually delete
 */

import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

const PROJECT_ID = 'skedaddle-inventory'
const PROTECTED_UID = 'jrDGTqdpieSdjZ7KCp3tYkPjd4R2' // boydabingham@gmail.com (admin)
const TARGET_UIDS = [
  '2W3KsijYVaf29Yug7GbExxIIQL32', // alexbingham@skedaddleinc.com (Sinch Test)
  'HpLTI35QbyZTekqeqt6KoisP1nf2', // bingham@skedaddle.co (User)
]

// Reference scan locations: collections that may carry uid fields. Read-only.
// Add to this list if you find more.
const REF_COLLECTIONS = [
  { name: 'inviteTokens', field: 'uid' },
  { name: 'auditLog', field: 'actorUid' },
  { name: 'tireOrders', field: 'createdBy' },
  { name: 'tireOrders', field: 'assignedTo' },
  { name: 'crewAssignments', field: 'uid' },
  { name: 'photoUploads', field: 'uploadedBy' },
]

function parseArgs(argv) {
  const out = { apply: false }
  for (const a of argv) {
    if (a === '--apply') out.apply = true
  }
  return out
}

async function main() {
  const { apply } = parseArgs(process.argv.slice(2))
  if (!getApps().length) {
    initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID })
  }
  const db = getFirestore()
  const auth = getAuth()

  console.log(`Target Firestore project: ${PROJECT_ID}`)
  console.log(`Mode: ${apply ? 'APPLY (real deletes)' : 'dry-run (no writes)'}`)
  console.log('')

  for (const uid of TARGET_UIDS) {
    if (uid === PROTECTED_UID) {
      console.log(`REFUSING to touch ${uid} (protected admin).`)
      continue
    }
    console.log(`=== ${uid} ===`)

    // 1. Firestore user doc
    const userRef = db.collection('users').doc(uid)
    const userSnap = await userRef.get()
    if (userSnap.exists) {
      const u = userSnap.data() || {}
      console.log(`  users/${uid}: email=${u.email} archivedAt=${u.archivedAt ? 'set' : 'null'} role=${u.role}`)
    } else {
      console.log(`  users/${uid}: NOT FOUND in Firestore`)
    }

    // 2. Reference scan
    for (const { name, field } of REF_COLLECTIONS) {
      try {
        const snap = await db.collection(name).where(field, '==', uid).limit(50).get()
        if (snap.empty) {
          console.log(`  refs in ${name}.${field}: 0`)
        } else {
          console.log(`  refs in ${name}.${field}: ${snap.size}${snap.size === 50 ? ' (capped)' : ''}`)
          for (const d of snap.docs.slice(0, 3)) {
            console.log(`    ${d.ref.path}`)
          }
          if (snap.size > 3) console.log(`    ... and ${snap.size - 3} more`)
        }
      } catch (e) {
        console.log(`  refs in ${name}.${field}: ERROR ${e?.message || e}`)
      }
    }

    // 3. Auth record
    let authExists = false
    try {
      const u = await auth.getUser(uid)
      authExists = true
      console.log(`  auth/${uid}: email=${u.email} disabled=${u.disabled}`)
    } catch (e) {
      if (e?.errorInfo?.code === 'auth/user-not-found') {
        console.log(`  auth/${uid}: NOT FOUND`)
      } else {
        console.log(`  auth/${uid}: ERROR ${e?.errorInfo?.code || e?.message || e}`)
      }
    }

    if (!apply) {
      console.log(`  [dry-run] no deletions performed`)
      console.log('')
      continue
    }

    // 4. Apply deletes — inviteTokens, then user doc, then Auth.
    try {
      const tokensSnap = await db.collection('inviteTokens').where('uid', '==', uid).get()
      const batch = db.batch()
      tokensSnap.docs.forEach((d) => batch.delete(d.ref))
      if (userSnap.exists) batch.delete(userRef)
      await batch.commit()
      console.log(`  DELETED users/${uid} + ${tokensSnap.size} inviteTokens`)
    } catch (e) {
      console.log(`  Firestore delete FAILED: ${e?.message || e}`)
      console.log('  Skipping Auth delete to avoid drift.')
      continue
    }

    if (authExists) {
      try {
        await auth.deleteUser(uid)
        console.log(`  DELETED auth/${uid}`)
      } catch (e) {
        console.log(`  Auth delete FAILED: ${e?.errorInfo?.code || e?.message || e}`)
      }
    }
    console.log('')
  }
  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
