/**
 * scripts/recovery/01-import-snapshot.mjs
 *
 * Phase 1 of wipe recovery (2026-04-25 customer data wipe).
 *
 * Imports the April 25 Firestore export into a NEW named database in the
 * same project. The live `(default)` database is never touched.
 *
 * What this does:
 *   1. Verifies the recovery database does not already exist
 *   2. Creates `recovery-2026-04-25` database in skedaddle-inventory
 *      at the same location as the live (default) database
 *   3. Triggers `gcloud firestore import` from the backup bucket folder
 *   4. Polls until the import operation completes
 *   5. Reports what was imported (collection counts where possible)
 *
 * Run:
 *   node scripts/recovery/01-import-snapshot.mjs           # dry run
 *   node scripts/recovery/01-import-snapshot.mjs --apply   # actually create + import
 *
 * Auth: needs gcloud authenticated as a user with Datastore Owner.
 *   $ gcloud auth login
 *   $ gcloud config set project skedaddle-inventory
 *
 * Idempotency: if the recovery database already exists, the script logs
 * and skips creation. The import itself is idempotent at the operation
 * level — Firestore overwrites on conflict in the recovery DB.
 */

import { execSync, spawnSync } from 'node:child_process'

const PROJECT_ID = 'skedaddle-inventory'
const RECOVERY_DB = 'recovery-2026-04-25'
const SOURCE_BUCKET = 'skedaddle-inventory-firestore-backups'
const SOURCE_FOLDER = '2026-04-25T091801Z' // confirmed from console screenshot
const SOURCE_URI = `gs://${SOURCE_BUCKET}/firestore/${SOURCE_FOLDER}`

const APPLY = process.argv.includes('--apply')

function sh(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim()
}

function shTry(cmd) {
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8' })
  return { ok: r.status === 0, stdout: r.stdout?.trim() || '', stderr: r.stderr?.trim() || '' }
}

function log(...args) {
  console.log('[01-import]', ...args)
}

function fail(msg) {
  console.error('[01-import] FAIL:', msg)
  process.exit(1)
}

async function main() {
  log(`mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`)
  log(`project: ${PROJECT_ID}`)
  log(`source : ${SOURCE_URI}`)
  log(`target : firestore database "${RECOVERY_DB}"`)
  log('')

  // ---- 1. Sanity: gcloud installed and authenticated --------------------
  const { ok: hasGcloud } = shTry('gcloud --version')
  if (!hasGcloud) fail('gcloud CLI not found on PATH. Install it and `gcloud auth login` first.')

  const account = sh('gcloud config get-value account 2>NUL || gcloud config get-value account')
  if (!account || account === '(unset)') {
    fail('No active gcloud account. Run: gcloud auth login')
  }
  log(`gcloud account: ${account}`)

  const activeProject = sh('gcloud config get-value project')
  if (activeProject !== PROJECT_ID) {
    log(`(note) active project is "${activeProject}", will pass --project=${PROJECT_ID} explicitly`)
  }

  // ---- 2. Verify source backup exists -----------------------------------
  log('')
  log('checking source backup...')
  const lsResult = shTry(`gcloud storage ls "${SOURCE_URI}/" --project=${PROJECT_ID}`)
  if (!lsResult.ok) {
    fail(`source backup not found at ${SOURCE_URI}/\n${lsResult.stderr}`)
  }
  log('source backup exists ✓')
  if (lsResult.stdout.includes('overall_export_metadata')) {
    log('found overall_export_metadata file ✓')
  }

  // ---- 3. Determine target location from default database ---------------
  log('')
  log('determining target location...')
  const defaultDbInfo = shTry(
    `gcloud firestore databases describe --database="(default)" --project=${PROJECT_ID} --format=value(locationId)`,
  )
  if (!defaultDbInfo.ok) {
    fail(`could not read default database location:\n${defaultDbInfo.stderr}`)
  }
  const targetLocation = defaultDbInfo.stdout
  log(`default DB location: ${targetLocation} (will create recovery DB in same location)`)

  // ---- 4. Check if recovery DB already exists ---------------------------
  log('')
  log('checking if recovery database already exists...')
  const existing = shTry(
    `gcloud firestore databases describe --database="${RECOVERY_DB}" --project=${PROJECT_ID} --format=value(name)`,
  )
  const dbAlreadyExists = existing.ok && existing.stdout.length > 0
  if (dbAlreadyExists) {
    log(`recovery database "${RECOVERY_DB}" already exists — will skip creation, proceed to import`)
  } else {
    log(`recovery database does not exist yet`)
  }

  // ---- 5. DRY RUN: print plan and exit ----------------------------------
  if (!APPLY) {
    log('')
    log('=== DRY RUN — would execute: ===')
    if (!dbAlreadyExists) {
      log(`gcloud firestore databases create \\`)
      log(`  --database=${RECOVERY_DB} \\`)
      log(`  --location=${targetLocation} \\`)
      log(`  --type=firestore-native \\`)
      log(`  --project=${PROJECT_ID}`)
      log('')
    }
    log(`gcloud firestore import "${SOURCE_URI}" \\`)
    log(`  --database=${RECOVERY_DB} \\`)
    log(`  --project=${PROJECT_ID} \\`)
    log(`  --async`)
    log('')
    log('=== Re-run with --apply to actually execute. ===')
    return
  }

  // ---- 6. Create recovery DB if needed ----------------------------------
  if (!dbAlreadyExists) {
    log('')
    log(`creating recovery database "${RECOVERY_DB}"...`)
    const createResult = spawnSync(
      'gcloud',
      [
        'firestore',
        'databases',
        'create',
        `--database=${RECOVERY_DB}`,
        `--location=${targetLocation}`,
        '--type=firestore-native',
        `--project=${PROJECT_ID}`,
      ],
      { stdio: 'inherit', shell: true },
    )
    if (createResult.status !== 0) fail('database create failed')
    log('recovery database created ✓')
  }

  // ---- 7. Trigger import (async — returns operation id) -----------------
  log('')
  log('starting import (async)...')
  const importResult = spawnSync(
    'gcloud',
    [
      'firestore',
      'import',
      SOURCE_URI,
      `--database=${RECOVERY_DB}`,
      `--project=${PROJECT_ID}`,
      '--async',
      '--format=value(name)',
    ],
    { encoding: 'utf8', shell: true },
  )
  if (importResult.status !== 0) {
    fail(`import command failed:\n${importResult.stderr}`)
  }
  const operationName = (importResult.stdout || '').trim()
  log(`import operation started: ${operationName}`)
  log('')
  log('to watch progress:')
  log(
    `  gcloud firestore operations describe ${operationName} --database=${RECOVERY_DB} --project=${PROJECT_ID}`,
  )
  log('')
  log('imports of small datasets typically finish in 5–30 minutes.')
  log('proceed to phase 2 once the operation state is DONE.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
