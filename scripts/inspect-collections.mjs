/**
 * scripts/inspect-collections.mjs
 *
 * Diagnostic: dump every doc in users / crmAccounts / crmLeads with the
 * fields archive-test-data.mjs uses to match. Read-only, prints to stdout.
 *
 * Use this to figure out the right filter constants when archive-test-data
 * returns zero matches.
 *
 * Run:  node scripts/inspect-collections.mjs
 */

import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const PROJECT_ID = 'skedaddle-inventory'

if (!getApps().length) {
  initializeApp({ projectId: PROJECT_ID, credential: applicationDefault() })
}
const db = getFirestore()

async function dump(collectionName, fieldList) {
  console.log(`\n=== ${collectionName} ===`)
  const snap = await db.collection(collectionName).get()
  if (snap.empty) {
    console.log('  (empty)')
    return
  }
  for (const doc of snap.docs) {
    const data = doc.data() || {}
    const parts = [`id="${doc.id}"`]
    for (const f of fieldList) {
      const v = data[f]
      if (v === null || v === undefined || v === '') continue
      const s = typeof v === 'string' ? v : JSON.stringify(v)
      parts.push(`${f}="${s.length > 60 ? s.slice(0, 57) + '…' : s}"`)
    }
    console.log('  • ' + parts.join('  '))
  }
}

await dump('users', ['displayName', 'email', 'name', 'firstName', 'lastName', 'role', 'crewTag'])
await dump('crmAccounts', ['name', 'displayName', 'company', 'companyName', 'stage', 'score'])
await dump('crmLeads', ['name', 'displayName', 'company', 'companyName', 'stage', 'score'])

process.exit(0)
