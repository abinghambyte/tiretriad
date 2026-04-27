/**
 * archive-test-data.mjs
 *
 * Soft-delete known test data: stamp `archivedAt` + `archivedReason` rather
 * than hard-delete. Reversible. Aligns with the proposed soft-delete pattern
 * in `docs/superpowers/specs/2026-04-25-wipe-safety-and-customer-recovery-design.md`.
 *
 * Targets (current 2026-04-26 cleanup pass):
 *   - crmAccounts where name === 'Skedaddle Inc' (we are not a lead for ourselves)
 *   - users where displayName/email matches one of the test fixture entries
 *
 * Default mode is DRY RUN: prints what would be archived, writes nothing.
 * Pass --apply to actually write `archivedAt: serverTimestamp()`.
 *
 * Auth: uses Application Default Credentials (same as `seed-tires.mjs`).
 *   $ gcloud auth application-default login
 *
 * Run:
 *   node scripts/archive-test-data.mjs              # dry run
 *   node scripts/archive-test-data.mjs --apply      # write archives
 *   node scripts/archive-test-data.mjs --restore    # un-archive (clear archivedAt)
 *
 * Reversible because this is soft-delete. To fully purge, use a separate
 * script after admin review.
 */

import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

const PROJECT_ID = 'skedaddle-inventory'

// --------------------------------------------------------------------------
// EDIT THIS BLOCK to match exact docs operator wants archived.
// Run with no flags first to see what matches BEFORE applying.
// --------------------------------------------------------------------------
const TARGETS = {
  crmAccounts: {
    // Match by exact name. Add any other "us as a lead" docs that show up.
    nameEquals: ['Skedaddle Inc', 'Skedaddle, Inc', 'Skedaddle, Inc.'],
  },
  users: {
    // Match by display name OR email. Add/remove based on dry-run output.
    displayNameEquals: ['User', 'Sinch Test'],
    emailContains: ['sinch', 'test@', 'noreply@'],
  },
}

// --------------------------------------------------------------------------
// Implementation
// --------------------------------------------------------------------------
const args = new Set(process.argv.slice(2))
const APPLY = args.has('--apply')
const RESTORE = args.has('--restore')
const VERBOSE = args.has('--verbose')

if (APPLY && RESTORE) {
  console.error('Cannot pass --apply and --restore together. Choose one.')
  process.exit(1)
}

if (!getApps().length) {
  initializeApp({ projectId: PROJECT_ID, credential: applicationDefault() })
}
const db = getFirestore()

const REASON = 'archived 2026-04-26 cleanup pass — see docs/superpowers/audits/2026-04-25-production-observations.md'

async function findCrmAccountMatches() {
  const out = []
  const snap = await db.collection('crmAccounts').get()
  for (const doc of snap.docs) {
    const data = doc.data() || {}
    const name = (data.name || data.displayName || '').trim()
    if (!name) continue
    if (TARGETS.crmAccounts.nameEquals.some((n) => n.toLowerCase() === name.toLowerCase())) {
      out.push({ ref: doc.ref, id: doc.id, name, currentArchived: data.archivedAt || null })
    }
  }
  return out
}

async function findUserMatches() {
  const out = []
  const snap = await db.collection('users').get()
  for (const doc of snap.docs) {
    const data = doc.data() || {}
    const dn = (data.displayName || '').trim()
    const email = (data.email || '').toLowerCase()
    const dnHit = TARGETS.users.displayNameEquals.some((n) => n.toLowerCase() === dn.toLowerCase())
    const emailHit = TARGETS.users.emailContains.some((s) => email.includes(s.toLowerCase()))
    if (dnHit || emailHit) {
      out.push({
        ref: doc.ref,
        id: doc.id,
        displayName: dn,
        email,
        matchedBy: dnHit ? 'displayName' : 'email',
        currentArchived: data.archivedAt || null,
      })
    }
  }
  return out
}

async function archive(ref, label) {
  await ref.set(
    { archivedAt: FieldValue.serverTimestamp(), archivedReason: REASON },
    { merge: true },
  )
  console.log(`  ✓ archived ${label}`)
}

async function restore(ref, label) {
  await ref.set(
    { archivedAt: FieldValue.delete(), archivedReason: FieldValue.delete() },
    { merge: true },
  )
  console.log(`  ✓ restored ${label}`)
}

async function main() {
  const mode = APPLY ? 'APPLY' : RESTORE ? 'RESTORE' : 'DRY RUN'
  console.log(`\n=== archive-test-data.mjs (${mode}) ===\n`)

  const crm = await findCrmAccountMatches()
  console.log(`crmAccounts matches: ${crm.length}`)
  for (const m of crm) {
    const status = m.currentArchived ? ' [already archived]' : ''
    console.log(`  • ${m.id} — "${m.name}"${status}`)
  }

  const users = await findUserMatches()
  console.log(`\nusers matches: ${users.length}`)
  for (const m of users) {
    const status = m.currentArchived ? ' [already archived]' : ''
    console.log(
      `  • ${m.id} — displayName="${m.displayName}" email="${m.email}" (matched ${m.matchedBy})${status}`,
    )
  }

  if (!APPLY && !RESTORE) {
    console.log('\nDry run only. Re-run with --apply to write archivedAt timestamps.')
    return
  }

  console.log(`\nWriting…`)
  for (const m of crm) {
    if (APPLY) await archive(m.ref, `crmAccounts/${m.id} (${m.name})`)
    else if (RESTORE) await restore(m.ref, `crmAccounts/${m.id} (${m.name})`)
  }
  for (const m of users) {
    if (APPLY)
      await archive(m.ref, `users/${m.id} (${m.displayName || m.email})`)
    else if (RESTORE)
      await restore(m.ref, `users/${m.id} (${m.displayName || m.email})`)
  }

  console.log(`\nDone.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
