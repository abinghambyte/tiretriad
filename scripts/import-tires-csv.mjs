/**
 * Import tire catalog CSV into Firestore `tires` collection.
 *
 * Expected CSV columns (header row): Brand, Tread, MSPN, Description, LR, FET, Price
 * Header matching is case-insensitive; extra whitespace is trimmed.
 *
 * Auth (pick one):
 *   --service-account path/to/serviceAccountKey.json
 *   or set GOOGLE_APPLICATION_CREDENTIALS to that JSON path (uses application default).
 *
 * Usage:
 *   node scripts/import-tires-csv.mjs ./catalog.csv
 *   node scripts/import-tires-csv.mjs ./catalog.csv --service-account ./keys/skedaddle.json
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { parse } from 'csv-parse/sync'
import { cert, getApps, initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

export const PROJECT_ID = 'skedaddle-inventory'

function isMainModule() {
  try {
    const selfPath = fileURLToPath(import.meta.url)
    return resolve(selfPath) === resolve(process.argv[1] || '')
  } catch {
    return false
  }
}

function parseArgs(argv) {
  const args = [...argv]
  const out = { csvPath: null, serviceAccountPath: null }
  while (args.length) {
    const a = args.shift()
    if (a === '--service-account' && args[0]) {
      out.serviceAccountPath = resolve(args.shift())
    } else if (!a.startsWith('-') && !out.csvPath) {
      out.csvPath = resolve(a)
    }
  }
  return out
}

function parseMoney(value) {
  if (value == null) return 0
  const s = String(value).replace(/[$,\s]/g, '').trim()
  if (s === '') return 0
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

function normalizeRecord(row) {
  const m = {}
  for (const [k, v] of Object.entries(row)) {
    const key = String(k).trim().toLowerCase()
    m[key] = typeof v === 'string' ? v.trim() : v
  }
  return m
}

function rowToTire(m) {
  const mspn = m.mspn != null ? String(m.mspn).trim() : ''
  if (!mspn) {
    return null
  }
  return {
    brand: m.brand != null ? String(m.brand).trim() : '',
    tread: m.tread != null ? String(m.tread).trim() : '',
    mspn,
    description: m.description != null ? String(m.description).trim() : '',
    lr: m.lr != null ? String(m.lr).trim() : '',
    fet: parseMoney(m.fet),
    // CSV column "Price" is Kyle's buy cost per tire, not retail. Per
    // AGENTS.md: `price` is the canonical buy-cost field; `retailPrice` must
    // not exist. Earlier versions of this importer wrote to `retailPrice` by
    // mistake; `scripts/migrate-tire-price-field.mjs` cleans that up on
    // existing docs.
    price: parseMoney(m.price),
    cost: 0,
    cts: 0,
    category: '',
    useTags: [],
  }
}

function initFirebase(serviceAccountPath) {
  if (getApps().length) return

  if (serviceAccountPath) {
    const json = JSON.parse(readFileSync(serviceAccountPath, 'utf8'))
    initializeApp({
      credential: cert(json),
      projectId: PROJECT_ID,
    })
    return
  }

  initializeApp({
    credential: applicationDefault(),
    projectId: PROJECT_ID,
  })
}

/**
 * @param {string} csvPath Absolute or resolved path to CSV
 * @param {{ serviceAccountPath?: string | null }} [options]
 * @returns {Promise<number>} number of tires written
 */
export async function importTiresFromCsv(csvPath, options = {}) {
  const { serviceAccountPath = null } = options
  initFirebase(serviceAccountPath ?? undefined)

  const raw = readFileSync(csvPath, 'utf8')
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  })

  const tires = []
  for (const row of records) {
    const tire = rowToTire(normalizeRecord(row))
    if (tire) tires.push(tire)
  }

  if (tires.length === 0) {
    throw new Error('No valid rows (each row needs a non-empty MSPN).')
  }

  const db = getFirestore()
  const col = db.collection('tires')

  const BATCH_SIZE = 400
  let written = 0
  for (let i = 0; i < tires.length; i += BATCH_SIZE) {
    const chunk = tires.slice(i, i + BATCH_SIZE)
    const batch = db.batch()
    for (const t of chunk) {
      batch.set(col.doc(t.mspn), t, { merge: true })
    }
    await batch.commit()
    written += chunk.length
    console.error(`Committed ${written} / ${tires.length}…`)
  }

  console.log(`Imported ${tires.length} tires into project "${PROJECT_ID}" (doc id = MSPN, merge).`)
  return tires.length
}

async function main() {
  const { csvPath, serviceAccountPath } = parseArgs(process.argv.slice(2))

  if (!csvPath) {
    console.error(
      'Usage: node scripts/import-tires-csv.mjs <path-to.csv> [--service-account path/to/key.json]',
    )
    process.exit(1)
  }

  try {
    await importTiresFromCsv(csvPath, { serviceAccountPath })
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  }
}

if (isMainModule()) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
