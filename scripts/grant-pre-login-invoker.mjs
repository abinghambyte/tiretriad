#!/usr/bin/env node
/**
 * Grant `allUsers` the `roles/run.invoker` role on every callable in the
 * invite-acceptance path so recipients (who have no Firebase Auth account
 * yet) can hit them. Firebase v2 callables are *supposed* to be publicly
 * invokable by default — `invoker: 'public'` in the onCall config asks
 * for the binding — but `firebase deploy` has been observed to land the
 * Cloud Run services with that binding stripped, leaving the function
 * rejecting every browser request with `Empty Authorization header value`
 * before the function body ever runs.
 *
 * This script reapplies the binding via `gcloud run services
 * add-iam-policy-binding`. Idempotent: re-running just confirms the
 * existing policy. Safe to wire into `npm run deploy:firebase` as a
 * postdeploy step.
 *
 * Usage:
 *   node scripts/grant-pre-login-invoker.mjs
 *
 * Requires `gcloud` on PATH and the active account to have
 * `roles/run.admin` (or equivalent) on the project. Project id and
 * region read from env vars with safe defaults; override either:
 *   PROJECT_ID  default `skedaddle-inventory`
 *   REGION      default `us-central1`
 */
import { spawnSync } from 'node:child_process'

const PROJECT_ID = process.env.PROJECT_ID || 'skedaddle-inventory'
const REGION = process.env.REGION || 'us-central1'

/**
 * Cloud Run service names are the lower-cased v2 callable function
 * names. Keep this list in sync with the `onCall({ invoker: 'public', ... })`
 * callables in `functions/inviteFlow.js` — anything a recipient invokes
 * before they have a Firebase Auth account goes here.
 */
const PRE_LOGIN_SERVICES = [
  'resolveinvite',
  'getinvitegreeting',
  'sendinviteregistrationcode',
  'completeinviteregistration',
]

function grant(service) {
  const args = [
    'run',
    'services',
    'add-iam-policy-binding',
    service,
    `--region=${REGION}`,
    `--project=${PROJECT_ID}`,
    '--member=allUsers',
    '--role=roles/run.invoker',
    '--quiet',
  ]
  const result = spawnSync('gcloud', args, { encoding: 'utf8' })
  if (result.error) {
    if (result.error.code === 'ENOENT') {
      console.error(
        '[grant-pre-login-invoker] gcloud not found on PATH. Install the Cloud SDK ' +
          'and authenticate (`gcloud auth login`) before running this script.',
      )
      process.exit(2)
    }
    throw result.error
  }
  if (result.status !== 0) {
    console.error(`[grant-pre-login-invoker] gcloud failed for ${service}:`)
    console.error(result.stderr || result.stdout)
    return false
  }
  console.log(`[grant-pre-login-invoker] ✓ ${service} — allUsers / roles/run.invoker`)
  return true
}

let ok = 0
let failed = 0
for (const service of PRE_LOGIN_SERVICES) {
  if (grant(service)) ok += 1
  else failed += 1
}

console.log(
  `[grant-pre-login-invoker] ${ok}/${PRE_LOGIN_SERVICES.length} services confirmed publicly invokable` +
    (failed ? ` (${failed} failed — see errors above)` : ''),
)

process.exit(failed ? 1 : 0)
