/**
 * Margin-floor research queue: nightly sweep that enqueues tires whose
 * researched retail would yield less than the configured margin floor, plus
 * callables for Kyle/sourcer to manually enqueue and resolve items.
 *
 * Queue shape (on `tires/{id}.researchQueue`):
 *   { at, by, reason, resolvedAt, resolvedOutcome, resolvedBy } | null
 * Margin formula: (retail - buy - overhead - fet) / retail
 * Default floor: `meta/payoutConfig.marginFloor` or 0.15.
 */
'use strict'

const admin = require('firebase-admin')
const { FieldValue } = require('firebase-admin/firestore')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')

const DEFAULT_MARGIN_FLOOR = 0.15
const ALLOWED_REASONS = Object.freeze(['below-margin-floor', 'unutilized-needs-research'])
const ALLOWED_OUTCOMES = Object.freeze(['retail-wrong', 'confirm-archive', 'punt'])

/**
 * Extract the numeric buy-cost per tire from a tire doc. Mirrors
 * `src/utils/tireCatalogBuy.js` so the sweep and backfill agree with the
 * portal's margin math.
 * @param {Record<string, unknown>} tire
 * @returns {number}
 */
function tireBuyNumber(tire) {
  if (!tire || typeof tire !== 'object') return 0
  const pi = tire.priceIntel && typeof tire.priceIntel === 'object' ? tire.priceIntel : {}
  const active = Number(pi.activeBuyPrice)
  if (Number.isFinite(active) && active > 0) return active
  const price = Number(tire.price)
  if (Number.isFinite(price) && price > 0) return price
  const cost = Number(tire.cost)
  if (Number.isFinite(cost) && cost > 0) return cost
  return 0
}

/**
 * Sum mount + delivery + other costs; `cts` wins when set.
 * @param {Record<string, unknown>} tire
 */
function tireOverheadNumber(tire) {
  if (!tire || typeof tire !== 'object') return 0
  const cts = Number(tire.cts)
  if (Number.isFinite(cts) && cts > 0) return cts
  const m = Number(tire.mountCost) || 0
  const d = Number(tire.deliveryCost) || 0
  const o = Number(tire.otherCost) || 0
  return m + d + o
}

function tireFetNumber(tire) {
  const f = Number(tire?.fet)
  return Number.isFinite(f) && f > 0 ? f : 0
}

function tireRetailNumber(tire) {
  const r = Number(tire?.retail)
  return Number.isFinite(r) && r > 0 ? r : 0
}

/**
 * Pure helper: decide whether a tire should be swept into the queue.
 * @param {Record<string, unknown>} tire
 * @param {number} defaultFloor
 * @returns {{ enqueue: boolean, margin: number | null, floor: number }}
 */
function evaluateSweepCandidate(tire, defaultFloor) {
  const floor = Number.isFinite(Number(tire?.marginFloor))
    ? Number(tire.marginFloor)
    : defaultFloor
  if (tire?.marginConfirmed === true) return { enqueue: false, margin: null, floor }
  if (tire?.researchQueue && typeof tire.researchQueue === 'object') {
    return { enqueue: false, margin: null, floor }
  }
  const retail = tireRetailNumber(tire)
  if (retail <= 0) return { enqueue: false, margin: null, floor }
  const buy = tireBuyNumber(tire)
  const overhead = tireOverheadNumber(tire)
  const fet = tireFetNumber(tire)
  const margin = (retail - buy - overhead - fet) / retail
  return { enqueue: margin < floor, margin, floor }
}

async function loadDefaultMarginFloor(db) {
  try {
    const snap = await db.collection('meta').doc('payoutConfig').get()
    if (!snap.exists) return DEFAULT_MARGIN_FLOOR
    const raw = Number(snap.data()?.marginFloor)
    if (Number.isFinite(raw) && raw > 0) return raw
  } catch (e) {
    console.error('researchQueue loadDefaultMarginFloor', e)
  }
  return DEFAULT_MARGIN_FLOOR
}

/**
 * Pure-ish sweep runner. Iterates every tire, writes queue entries for ones
 * that are below their margin floor and not already queued/confirmed.
 * @param {FirebaseFirestore.Firestore} db
 * @param {{ serverTimestamp?: () => unknown }} [opts]
 */
async function runBelowMarginFloorSweep(db, opts = {}) {
  const defaultFloor = await loadDefaultMarginFloor(db)
  const serverTimestamp =
    opts.serverTimestamp || (() => FieldValue.serverTimestamp())
  let scanned = 0
  let enqueued = 0
  const snap = await db.collection('tires').get()
  let batch = db.batch()
  let ops = 0
  for (const doc of snap.docs) {
    scanned += 1
    const data = doc.data() || {}
    const verdict = evaluateSweepCandidate(data, defaultFloor)
    if (!verdict.enqueue) continue
    batch.set(
      doc.ref,
      {
        researchQueue: {
          at: serverTimestamp(),
          by: 'system',
          reason: 'below-margin-floor',
          resolvedAt: null,
          resolvedOutcome: null,
          resolvedBy: null,
        },
      },
      { merge: true },
    )
    ops += 1
    enqueued += 1
    if (ops >= 400) {
      await batch.commit()
      batch = db.batch()
      ops = 0
    }
  }
  if (ops > 0) await batch.commit()
  console.log(
    JSON.stringify({ event: 'researchQueue.sweep', scanned, enqueued, defaultFloor }),
  )
  return { scanned, enqueued }
}

async function loadUserRole(db, uid) {
  const snap = await db.collection('users').doc(uid).get()
  if (!snap.exists) return ''
  return String(snap.get('role') || '')
}

async function requireNonViewerRole(db, request) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }
  const role = await loadUserRole(db, request.auth.uid)
  if (!role || role === 'viewer') {
    throw new HttpsError('permission-denied', 'Non-viewer role required.')
  }
  return role
}

async function requireSourcerOrAdmin(db, request) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }
  const role = await loadUserRole(db, request.auth.uid)
  if (role !== 'admin' && role !== 'sourcer') {
    throw new HttpsError('permission-denied', 'Admin or sourcer role required.')
  }
  return role
}

function hasOpenQueueEntry(tireData) {
  const q = tireData?.researchQueue
  return q && typeof q === 'object' && q.resolvedAt == null
}

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {import('firebase-functions/v2/https').CallableRequest} request
 */
async function enqueueToResearchImpl(db, request) {
  await requireNonViewerRole(db, request)
  const tireId = String(request.data?.tireId || '').trim()
  const reason = String(request.data?.reason || '')
  if (!tireId) {
    throw new HttpsError('invalid-argument', 'tireId is required.')
  }
  if (!ALLOWED_REASONS.includes(reason)) {
    throw new HttpsError('invalid-argument', `reason must be one of ${ALLOWED_REASONS.join(', ')}.`)
  }
  const ref = db.collection('tires').doc(tireId)
  const snap = await ref.get()
  if (!snap.exists) {
    throw new HttpsError('not-found', `Tire ${tireId} not found.`)
  }
  const data = snap.data() || {}
  if (hasOpenQueueEntry(data)) {
    throw new HttpsError('failed-precondition', 'Tire already has an open queue entry.')
  }
  await ref.set(
    {
      researchQueue: {
        at: FieldValue.serverTimestamp(),
        by: request.auth.uid,
        reason,
        resolvedAt: null,
        resolvedOutcome: null,
        resolvedBy: null,
      },
    },
    { merge: true },
  )
  return { ok: true }
}

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {import('firebase-functions/v2/https').CallableRequest} request
 */
async function resolveQueueItemImpl(db, request) {
  await requireSourcerOrAdmin(db, request)
  const tireId = String(request.data?.tireId || '').trim()
  const outcome = String(request.data?.outcome || '')
  if (!tireId) {
    throw new HttpsError('invalid-argument', 'tireId is required.')
  }
  if (!ALLOWED_OUTCOMES.includes(outcome)) {
    throw new HttpsError('invalid-argument', `outcome must be one of ${ALLOWED_OUTCOMES.join(', ')}.`)
  }
  const ref = db.collection('tires').doc(tireId)
  const snap = await ref.get()
  if (!snap.exists) {
    throw new HttpsError('not-found', `Tire ${tireId} not found.`)
  }
  const data = snap.data() || {}
  const existing = data.researchQueue && typeof data.researchQueue === 'object' ? data.researchQueue : null

  if (outcome === 'retail-wrong') {
    const newRetail = Number(request.data?.newRetail)
    if (!Number.isFinite(newRetail) || newRetail <= 0) {
      throw new HttpsError('invalid-argument', 'newRetail must be a positive number.')
    }
    const priorRetail = Number(data.retail) || 0
    console.log(
      JSON.stringify({
        event: 'researchQueue.resolve.retailWrong',
        tireId,
        priorRetail,
        newRetail,
        by: request.auth.uid,
      }),
    )
    await ref.set(
      {
        retail: newRetail,
        researchQueue: null,
      },
      { merge: true },
    )
    return { ok: true, priorRetail }
  }

  if (outcome === 'confirm-archive') {
    await ref.set(
      {
        marginConfirmed: true,
        researchQueue: {
          at: existing?.at || FieldValue.serverTimestamp(),
          by: existing?.by || request.auth.uid,
          reason: existing?.reason || 'below-margin-floor',
          resolvedAt: FieldValue.serverTimestamp(),
          resolvedOutcome: 'confirm-archive',
          resolvedBy: request.auth.uid,
        },
      },
      { merge: true },
    )
    return { ok: true }
  }

  // 'punt' — bump `at` to now, keep open.
  await ref.set(
    {
      researchQueue: {
        at: FieldValue.serverTimestamp(),
        by: existing?.by || request.auth.uid,
        reason: existing?.reason || 'below-margin-floor',
        resolvedAt: null,
        resolvedOutcome: null,
        resolvedBy: null,
      },
    },
    { merge: true },
  )
  return { ok: true }
}

const enqueueBelowMarginFloor = onSchedule(
  {
    schedule: '0 3 * * *',
    timeZone: 'America/Chicago',
    region: 'us-central1',
  },
  async () => {
    await runBelowMarginFloorSweep(admin.firestore())
  },
)

const enqueueToResearch = onCall(async (request) =>
  enqueueToResearchImpl(admin.firestore(), request),
)

const resolveQueueItem = onCall(async (request) =>
  resolveQueueItemImpl(admin.firestore(), request),
)

module.exports = {
  DEFAULT_MARGIN_FLOOR,
  ALLOWED_REASONS,
  ALLOWED_OUTCOMES,
  evaluateSweepCandidate,
  runBelowMarginFloorSweep,
  loadDefaultMarginFloor,
  enqueueToResearchImpl,
  resolveQueueItemImpl,
  enqueueBelowMarginFloor,
  enqueueToResearch,
  resolveQueueItem,
}
