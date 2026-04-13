/**
 * Creates `meta/creditTracker` for the fleet card limit workflow.
 *
 * Run with Application Default Credentials or GOOGLE_APPLICATION_CREDENTIALS
 * (service account with Firestore write).
 *
 *   node scripts/seed-credit-tracker.mjs
 */
import { getApps, initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const PROJECT_ID = 'skedaddle-inventory'

if (!getApps().length) {
  initializeApp({ projectId: PROJECT_ID, credential: applicationDefault() })
}

const db = getFirestore()

await db.doc('meta/creditTracker').set(
  {
    cardLimit: 20000,
    currentBalance: 15000,
    pendingCharges: [],
    refundPipeline: [],
    payments: [],
    updatedAt: FieldValue.serverTimestamp(),
  },
  { merge: true },
)

console.log('Wrote meta/creditTracker (merge).')
