/**
 * One-off: reset `meta/revenueStats` to the zeroed default doc.
 *
 * Why this exists separately from wipe-test-orders.mjs:
 *   wipe-test-orders.mjs imports defaultRevenueDoc() from
 *   functions/financeStats.js. That function calls FieldValue.serverTimestamp()
 *   from functions/node_modules/firebase-admin, while wipe-test-orders.mjs's
 *   getFirestore() uses the ROOT node_modules/firebase-admin. Firestore rejects
 *   the cross-package FieldValue sentinel ("Couldn't serialize object of type
 *   ServerTimestampTransform"). This script avoids the issue by constructing
 *   the zeroed doc inline using only imports from the same SDK instance.
 *
 * Prerequisites:
 *   Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path.
 *
 * Run:
 *   node scripts/reset-revenue-stats.mjs
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

function requireCredentialsPath() {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!raw || !String(raw).trim()) {
    console.error(
      'Missing GOOGLE_APPLICATION_CREDENTIALS. Set it to the path of your service account JSON key file.',
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

// Inline mirror of functions/financeStats.js::defaultRevenueDoc() but using
// THIS script's FieldValue — same SDK instance as getFirestore() below.
function zeroedRevenueDoc() {
  return {
    dailyWindow: '',
    weeklyWindow: '',
    monthlyWindow: '',
    ytdYear: 0,
    dailyRevenue: 0,
    weeklyRevenue: 0,
    monthlyRevenue: 0,
    ytdRevenue: 0,
    allTimeRevenue: 0,
    dailyCost: 0,
    weeklyCost: 0,
    monthlyCost: 0,
    ytdCost: 0,
    allTimeCost: 0,
    dailyMargin: 0,
    weeklyMargin: 0,
    monthlyMargin: 0,
    ytdMargin: 0,
    allTimeMargin: 0,
    dailyHistory: {},
    updatedAt: FieldValue.serverTimestamp(),
  }
}

async function main() {
  const credPath = requireCredentialsPath()
  initFirebase(credPath)
  const db = getFirestore()

  console.log('--- reset-revenue-stats: start ---')
  await db.collection('meta').doc('revenueStats').set(zeroedRevenueDoc())
  console.log('Reset meta/revenueStats to zeroed default.')

  // Read-back sanity check.
  const snap = await db.collection('meta').doc('revenueStats').get()
  const data = snap.exists ? snap.data() : null
  if (!data) {
    console.error('Read-back failed: doc does not exist.')
    process.exit(1)
  }
  const keyFields = {
    allTimeRevenue: data.allTimeRevenue,
    allTimeCost: data.allTimeCost,
    allTimeMargin: data.allTimeMargin,
    ytdRevenue: data.ytdRevenue,
    dailyRevenue: data.dailyRevenue,
    dailyHistoryKeys: Object.keys(data.dailyHistory || {}).length,
  }
  console.log('readBack=', keyFields)
  console.log('--- reset-revenue-stats: end ---')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
