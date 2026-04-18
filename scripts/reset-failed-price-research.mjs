/**
 * Reset the retry counter on tires that hit the 3-strike cap
 * (`MAX_FAILED_ATTEMPTS = 3`) during the prompt-iteration period.
 *
 * For every tire with no `priceIntel.retailPrice`, this:
 *   1. filters `gemini_not_found` and `gemini_suspicious_delta` entries out
 *      of `priceIntel.sources` (preserves any successful/confirmed entries),
 *   2. deletes `priceIntel.lastResearched` so the cron treats the tire as
 *      never-researched-yet,
 *   3. leaves `priceIntel.kyleConfirmed` alone so any Kyle-frozen tires
 *      stay frozen.
 *
 * The next catchup cron (fires on :15) picks the reset tires back up.
 *
 * Usage:
 *   node scripts/reset-failed-price-research.mjs --dry-run
 *   node scripts/reset-failed-price-research.mjs
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

const PROJECT_ID = 'skedaddle-inventory'
const FAILED_SOURCE_TAGS = new Set(['gemini_not_found', 'gemini_suspicious_delta'])

function parseArgs(argv) {
  const out = { dryRun: false, serviceAccountPath: null }
  const args = [...argv]
  while (args.length) {
    const a = args.shift()
    if (a === '--dry-run' || a === '-n') out.dryRun = true
    else if (a === '--service-account' && args[0]) out.serviceAccountPath = resolve(args.shift())
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

async function run({ dryRun, serviceAccountPath }) {
  initFirebase(serviceAccountPath)
  const db = getFirestore()
  const snap = await db.collection('tires').select('priceIntel').get()

  let total = 0
  let needsReset = 0
  let alreadyClean = 0
  let hasResearchedRetail = 0
  const ops = []

  for (const doc of snap.docs) {
    total += 1
    const pi = doc.get('priceIntel') || null
    const retail = Number(pi?.retailPrice)
    if (Number.isFinite(retail) && retail > 0) {
      hasResearchedRetail += 1
      continue
    }

    const sources = Array.isArray(pi?.sources) ? pi.sources : []
    const cleanedSources = sources.filter((s) => {
      const tag = s && typeof s === 'object' ? String(s.source || '') : ''
      return !FAILED_SOURCE_TAGS.has(tag)
    })
    const hadFailedAttempts = cleanedSources.length < sources.length
    const hadLastResearched = pi?.lastResearched != null

    if (!hadFailedAttempts && !hadLastResearched) {
      alreadyClean += 1
      continue
    }

    needsReset += 1
    ops.push({
      ref: doc.ref,
      update: {
        'priceIntel.sources': cleanedSources,
        'priceIntel.lastResearched': FieldValue.delete(),
      },
    })
  }

  console.log(`Scan complete: ${total} tires.`)
  console.log(`  already have researched retail: ${hasResearchedRetail}`)
  console.log(`  already clean (no reset needed): ${alreadyClean}`)
  console.log(`  need reset: ${needsReset}`)

  if (dryRun) {
    console.log('DRY RUN: no writes.')
    return
  }

  const CHUNK = 400
  let written = 0
  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = db.batch()
    for (const op of ops.slice(i, i + CHUNK)) {
      batch.update(op.ref, op.update)
    }
    await batch.commit()
    written += Math.min(CHUNK, ops.length - i)
    console.log(`  committed ${written} / ${ops.length}…`)
  }
  console.log('Reset complete.')
}

run(parseArgs(process.argv.slice(2))).catch((err) => {
  console.error(err)
  process.exit(1)
})
