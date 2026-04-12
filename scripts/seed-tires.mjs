/**
 * Seeds the `tires` collection (document id = MSPN).
 *
 * If `scripts/tires.csv` exists (headers: Brand, Tread, MSPN, Description, LR, FET, Price),
 * imports the full catalog using the same logic as `import-tires-csv.mjs`.
 * Otherwise writes a small demo set.
 *
 * Prerequisites:
 * - Application Default Credentials or GOOGLE_APPLICATION_CREDENTIALS
 *   pointing at a service account with Firestore write access.
 *
 * Run: npm run seed:tires
 * Full catalog: place `tires.csv` in this folder, then run the same command.
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { importTiresFromCsv } from './import-tires-csv.mjs'

const PROJECT_ID = 'skedaddle-inventory'
const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_CSV = join(__dirname, 'tires.csv')

const SEED = [
  {
    brand: 'MICHELIN',
    tread: 'XLEZ',
    mspn: '03363',
    description: '11R22.5 X LEZ LRG',
    lr: 'G',
    fet: 25.23,
    cost: 520,
    cts: 545.23,
    retailPrice: 616,
    category: 'Commercial',
    useTags: ['highway', 'commercial', 'long-haul'],
    notes: 'From catalog seed; adjust cost/CTS as needed.',
  },
  {
    brand: 'BRIDGESTONE',
    tread: 'M860',
    mspn: 'BR-M860-225',
    description: '11R22.5 M860 Ecopia',
    lr: 'G',
    fet: 24.5,
    cost: 498,
    cts: 522.5,
    retailPrice: 589,
    category: 'Highway',
    useTags: ['highway', 'regional'],
    notes: '',
  },
  {
    brand: 'GOODYEAR',
    tread: 'G572',
    mspn: 'GY-G572-225',
    description: '11R22.5 G572 LHD Fuel Max',
    lr: 'G',
    fet: 24.8,
    cost: 510,
    cts: 534.8,
    retailPrice: 640,
    category: 'Highway',
    useTags: ['long-haul', 'fuel'],
    notes: '',
  },
  {
    brand: 'CONTINENTAL',
    tread: 'HDR2',
    mspn: 'CON-HDR2-225',
    description: '11R22.5 HDR2 Eco Plus',
    lr: 'H',
    fet: 26.1,
    cost: 540,
    cts: 566.1,
    retailPrice: 705,
    category: 'Commercial',
    useTags: ['commercial', 'heavy-haul'],
    notes: '',
  },
]

async function seedDemo() {
  if (!getApps().length) {
    initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID })
  }
  const db = getFirestore()
  let batch = db.batch()
  let n = 0
  for (const row of SEED) {
    const id = String(row.mspn)
    batch.set(db.collection('tires').doc(id), row, { merge: true })
    n += 1
    if (n % 400 === 0) {
      await batch.commit()
      batch = db.batch()
    }
  }
  await batch.commit()
  console.log(`Seeded ${SEED.length} demo tires (merge by MSPN).`)
}

async function main() {
  if (existsSync(DEFAULT_CSV)) {
    await importTiresFromCsv(DEFAULT_CSV, {})
    return
  }
  console.warn(
    'No scripts/tires.csv — seeding demo SKUs only. Add tires.csv here for a full catalog import.',
  )
  await seedDemo()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
