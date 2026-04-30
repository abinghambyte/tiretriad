/**
 * Parse a Michelin eFleet HTML report into a map of MSPN → category.
 * Pure function — no Firestore writes here. Wiring lives in the CLI
 * entry point at the bottom of this file (added in Task 3).
 *
 * Run: npm run import:efleet -- path/to/efleet.html
 */

import { existsSync, readFileSync } from 'node:fs'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { resolve, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

const BRAND_CLASS_MAP = {
  bfg: 'BFGOODRICH',
  mich: 'MICHELIN',
  uni: 'UNIROYAL',
}

/**
 * @param {string} html
 * @returns {{
 *   mspns: Record<string, 'passenger' | 'lightTruck' | 'truck'>,
 *   tireRecords: Array<{
 *     mspn: string,
 *     brand: 'MICHELIN' | 'BFGOODRICH' | 'UNIROYAL',
 *     tread: string,
 *     description: string,
 *     lr: string,
 *     fet: number,
 *     price: number,
 *     category: 'passenger' | 'lightTruck' | 'truck',
 *   }>,
 *   account: string | null,
 *   sourceReportDate: string | null,
 *   totalParsed: number,
 *   warnings: Array<{ kind: string, message: string, mspn?: string }>,
 * }}
 */
export function parseEfleetCatalog(html) {
  if (!html || typeof html !== 'string' || html.trim() === '') {
    throw new Error('parseEfleetCatalog: empty input')
  }
  const tables = html.match(/<table class="product-table">[\s\S]*?<\/table>/g) || []
  const catBlocks = html.split(/class="cat-section"/)
  if (tables.length === 0 || catBlocks.length < 2) {
    throw new Error(
      'parseEfleetCatalog: malformed input — no product-table or no cat-section blocks found',
    )
  }

  const mspns = {}
  const tireRecords = []
  const warnings = []

  for (let i = 1; i < catBlocks.length; i++) {
    const block = catBlocks[i]
    const titleM = block.match(/class="cat-header-title">([^<]+)/)
    const title = titleM ? titleM[1].trim() : ''
    let cat = null
    if (/light truck/i.test(title)) cat = 'lightTruck'
    else if (/passenger/i.test(title)) cat = 'passenger'
    else if (/^truck\b/i.test(title)) cat = 'truck'
    if (!cat) continue

    // Walk each brand-section inside this cat-section.
    const brandBlocks = block.split(/class="brand-section"/)
    for (let j = 1; j < brandBlocks.length; j++) {
      const bblock = brandBlocks[j]
      const brandTitleM = bblock.match(/class="brand-title\s+(\w+)"/)
      const brandKey = brandTitleM ? brandTitleM[1].toLowerCase() : null
      const brand = brandKey ? BRAND_CLASS_MAP[brandKey] : null
      if (!brand) {
        warnings.push({ kind: 'unknownBrand', message: `Unrecognized brand class: ${brandKey}` })
        continue
      }

      // Each <tr> inside this brand's product-table is a row to parse.
      const rowRe = /<tr>[\s\S]*?<\/tr>/g
      const rows = bblock.match(rowRe) || []
      for (const row of rows) {
        // Skip header row (has <th>, not <td>)
        if (row.includes('<th')) continue
        const mspnM = row.match(/<td[^>]*style="[^"]*font-family:monospace[^"]*"[^>]*>([0-9]{4,7})<\/td>/)
        if (!mspnM) continue
        const mspn = mspnM[1]

        // Extract remaining cells via greedy <td>(content)</td> walk
        const cellsRe = /<td[^>]*>([\s\S]*?)<\/td>/g
        const cells = []
        let cm
        while ((cm = cellsRe.exec(row)) !== null) {
          cells.push(
            cm[1]
              .replace(/<[^>]+>/g, ' ')
              .replace(/&nbsp;/g, ' ')
              .replace(/\s+/g, ' ')
              .trim(),
          )
        }
        // Expected order: MSPN, Tread, Description, LR, FET, Price
        if (cells.length < 6) {
          warnings.push({ kind: 'malformedRow', message: 'Row had fewer than 6 cells', mspn })
          continue
        }
        const tread = cells[1]
        const description = cells[2]
        const lrRaw = cells[3]
        const fetRaw = cells[4]
        const priceRaw = cells[5]

        // PQL = price quoted locally, can't be priced from HTML.
        if (/^PQL$/i.test(priceRaw)) {
          warnings.push({ kind: 'pql', message: 'Price quoted locally; row skipped', mspn })
          continue
        }

        const lr = lrRaw === '—' ? '' : lrRaw.toUpperCase()
        const fet = Number(String(fetRaw).replace(/[^0-9.]/g, '')) || 0
        const priceCleaned = String(priceRaw).replace(/[^0-9.]/g, '')
        const price = Number(priceCleaned)
        if (!Number.isFinite(price) || price <= 0) {
          warnings.push({ kind: 'invalidPrice', message: `Invalid price: ${priceRaw}`, mspn })
          continue
        }

        if (!tread) {
          warnings.push({ kind: 'missingTread', message: 'Tread cell empty', mspn })
        }

        mspns[mspn] = cat
        tireRecords.push({
          mspn,
          brand,
          tread,
          description,
          lr,
          fet,
          price,
          category: cat,
        })
      }
    }
  }

  if (Object.keys(mspns).length === 0) {
    throw new Error(
      'parseEfleetCatalog: malformed input — no MSPNs extracted (parser regex may need updating for new HTML format)',
    )
  }

  const acctM = html.match(/Ship To: ([^<]+)/)
  const account = acctM ? acctM[1].trim() : null

  const dateM = html.match(/Report Date:<\/td><td>([^<]+)/)
  let sourceReportDate = null
  if (dateM) {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ]
    const dm = dateM[1].match(/(\w+)\s+(\d{1,2}),\s+(\d{4})/)
    if (dm) {
      const idx = months.findIndex((mn) => mn.toLowerCase() === dm[1].toLowerCase())
      if (idx >= 0) {
        const mm = String(idx + 1).padStart(2, '0')
        const dd = String(parseInt(dm[2], 10)).padStart(2, '0')
        sourceReportDate = `${dm[3]}-${mm}-${dd}`
      }
    }
  }

  return {
    mspns,
    tireRecords,
    account,
    sourceReportDate,
    totalParsed: tireRecords.length,
    warnings,
  }
}

export const SERVER_TIMESTAMP_SENTINEL = 'SERVER_TIMESTAMP_SENTINEL'

const EFLEET_SOURCED_FIELDS = ['price', 'fet', 'description', 'lr', 'tread']

/**
 * Plan the four-phase Firestore writes for an import.
 * Pure function — no I/O. Caller materializes the plan into actual writes.
 *
 * @param {Array<{ id: string, [key: string]: unknown }>} existingDocs
 * @param {Array<{ mspn: string, brand: string, tread: string, description: string, lr: string, fet: number, price: number, category: string }>} tireRecords
 * @returns {{
 *   inserts: Array<object>,
 *   offProgramSets: Array<{ id: string }>,
 *   offProgramClears: Array<{ id: string }>,
 *   fieldDiffs: Array<{ id: string, mspn: string, changes: Array<{ field: string, from: unknown, to: unknown }> }>,
 *   brandConflicts: Array<{ mspn: string, existingBrand: string, htmlBrand: string }>,
 *   skipped: Array<{ id: string, reason: string }>,
 * }}
 */
export function planTirePhases(existingDocs, tireRecords) {
  const inserts = []
  const offProgramSets = []
  const offProgramClears = []
  const fieldDiffs = []
  const brandConflicts = []
  const skipped = []

  const docsByMspn = new Map()
  for (const doc of existingDocs) {
    const key = String(doc?.id ?? doc?.mspn ?? '').trim()
    if (key) docsByMspn.set(key, doc)
  }
  const recordsByMspn = new Map(tireRecords.map((r) => [String(r.mspn).trim(), r]))

  for (const record of tireRecords) {
    const mspn = String(record.mspn).trim()
    const doc = docsByMspn.get(mspn)

    if (!doc) {
      // Phase 2: Insert.
      inserts.push({
        ...record,
        firstSeenInEfleetAt: SERVER_TIMESTAMP_SENTINEL,
      })
      continue
    }

    if (doc.archivedAt) {
      skipped.push({ id: doc.id, reason: 'archivedAt' })
      continue
    }

    // Re-emergence: doc has offProgramAt but the MSPN is in this HTML now.
    if (doc.offProgramAt) {
      offProgramClears.push({ id: doc.id })
    }

    // Brand conflict (logged separately; brand is not auto-rebranded in field diff).
    if (doc.brand && doc.brand !== record.brand) {
      brandConflicts.push({
        mspn,
        existingBrand: doc.brand,
        htmlBrand: record.brand,
      })
    }

    // Field-level diff for the eFleet-sourced fields only.
    const changes = []
    for (const field of EFLEET_SOURCED_FIELDS) {
      const before = doc[field]
      const after = record[field]
      if (before !== after) {
        changes.push({ field, from: before, to: after })
      }
    }
    if (changes.length > 0) {
      fieldDiffs.push({ id: doc.id, mspn, changes })
    }
  }

  // Phase 3 set: docs in Firestore whose MSPN is absent from this HTML.
  for (const doc of existingDocs) {
    const mspn = String(doc?.id ?? doc?.mspn ?? '').trim()
    if (!mspn) continue
    if (doc.archivedAt) continue
    if (recordsByMspn.has(mspn)) continue
    if (doc.offProgramAt) continue
    offProgramSets.push({ id: doc.id })
  }

  return {
    inserts,
    offProgramSets,
    offProgramClears,
    fieldDiffs,
    brandConflicts,
    skipped,
  }
}

function isExecutedDirectly() {
  const entry = process.argv[1]
  if (!entry) return false
  return normalize(fileURLToPath(import.meta.url)) === normalize(resolve(entry))
}

function parseArgs(argv) {
  const out = { dryRun: false, yes: false, htmlPath: null }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--dry-run' || a === '-n') out.dryRun = true
    else if (a === '--yes') out.yes = true
    else if (a.startsWith('-')) {
      console.error(`Unknown flag: ${a}`)
      console.error('Usage: npm run import:efleet -- path/to/efleet.html [--dry-run] [--yes]')
      process.exit(1)
    }
    else out.htmlPath = a
  }
  return out
}

function requireCredentials() {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!raw || !String(raw).trim()) {
    console.error('Missing GOOGLE_APPLICATION_CREDENTIALS. Set it to the path of your service account JSON key file.')
    console.error('Generate a key: Firebase Console -> Settings -> Service accounts -> Generate new private key.')
    process.exit(1)
  }
  if (!existsSync(raw)) {
    console.error(`Service account file not found: ${raw}`)
    process.exit(1)
  }
  const json = JSON.parse(readFileSync(raw, 'utf8'))
  if (!json.project_id) {
    console.error('Service account JSON missing project_id field.')
    process.exit(1)
  }
  return json
}

function diffMaps(prev, next) {
  const added = []
  const removed = []
  const changed = []
  const prevKeys = prev ? Object.keys(prev) : []
  const nextKeys = Object.keys(next)
  const prevSet = new Set(prevKeys)
  const nextSet = new Set(nextKeys)
  for (const k of nextKeys) if (!prevSet.has(k)) added.push(k)
  for (const k of prevKeys) if (!nextSet.has(k)) removed.push(k)
  for (const k of nextKeys) if (prevSet.has(k) && prev[k] !== next[k]) changed.push({ mspn: k, from: prev[k], to: next[k] })
  return { added, removed, changed }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.htmlPath) {
    console.error('Usage: npm run import:efleet -- path/to/efleet.html [--dry-run] [--yes]')
    process.exit(1)
  }
  const html = readFileSync(resolve(args.htmlPath), 'utf8')
  console.log(`Parsing ${args.htmlPath}…`)
  const parsed = parseEfleetCatalog(html)
  console.log(`  Source date: ${parsed.sourceReportDate || '(unknown)'}`)
  console.log(`  Account: ${parsed.account || '(unknown)'}`)
  console.log(`  Total parsed: ${parsed.totalParsed}`)
  const cats = {}
  for (const v of Object.values(parsed.mspns)) cats[v] = (cats[v] || 0) + 1
  console.log(`    Light Truck: ${cats.lightTruck || 0}`)
  console.log(`    Passenger:   ${cats.passenger || 0}`)
  console.log(`    Truck:       ${cats.truck || 0}`)

  if (args.dryRun) {
    console.log('\n--dry-run: skipping Firestore write.')
    process.exit(0)
  }

  const sa = requireCredentials()
  if (!getApps().length) initializeApp({ credential: cert(sa), projectId: sa.project_id })
  const db = getFirestore()
  const projectId = db.app?.options?.projectId || '(unknown)'
  console.log(`\nTarget Firestore project: ${projectId}`)

  const ref = db.doc('meta/categoryMap')
  const stagingRef = db.doc('meta/categoryMapStaging')
  const prior = (await ref.get()).data() || null

  const payload = {
    version: 1,
    importedAt: FieldValue.serverTimestamp(),
    sourceFile: args.htmlPath,
    sourceReportDate: parsed.sourceReportDate,
    account: parsed.account,
    totalParsed: parsed.totalParsed,
    mspns: parsed.mspns,
  }

  // Diff
  const diff = diffMaps(prior?.mspns, parsed.mspns)
  console.log('\nDiff vs prior import:')
  console.log(`  + ${diff.added.length} new MSPNs categorized`)
  console.log(`  - ${diff.removed.length} MSPNs removed`)
  console.log(`  ~ ${diff.changed.length} MSPNs changed category`)
  if (diff.changed.length > 0 && diff.changed.length <= 20) {
    diff.changed.forEach((c) => console.log(`    ${c.mspn}: ${c.from} → ${c.to}`))
  }

  if (!args.yes) {
    const rl = readline.createInterface({ input, output })
    const answer = await rl.question('\nContinue? [y/N] ')
    rl.close()
    if (answer.trim().toLowerCase() !== 'y') {
      console.log('Aborted.')
      process.exit(0)
    }
  }

  // Stage first, then atomic move (Firestore docs are atomic per-doc;
  // writing staging then ref preserves prior on staging-write failure).
  await stagingRef.set(payload)
  await ref.set(payload)
  console.log(`\n✓ Wrote meta/categoryMap (${parsed.totalParsed} entries)`)
  console.log('Done.')
}

// Only run main when invoked directly via the CLI, not when imported by tests.
if (isExecutedDirectly()) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
