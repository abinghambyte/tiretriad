const { tireLandedBuyNumber } = require('./payoutConfig')

async function getTireByMspn({ firestore, mspn }) {
  const id = String(mspn || '').trim()
  if (!id) return null
  const snap = await firestore.collection('tires').doc(id).get()
  if (!snap.exists) return null
  const t = snap.data() || {}
  return {
    mspn: id,
    description: t.description || '',
    brand: t.brand || '',
    lr: t.lr || '',
    price: Number(t.price) || 0,
    fet: Number(t.fet) || 0,
    priceIntel: {
      retailPrice: Number(t?.priceIntel?.retailPrice) || null,
      retailSources: Array.isArray(t?.priceIntel?.retailSources) ? t.priceIntel.retailSources.slice(0, 5) : [],
      activeBuyPrice: Number(t?.priceIntel?.activeBuyPrice) || null,
      confidence: t?.priceIntel?.confidence || null,
      lastResearchedAt: t?.priceIntel?.lastResearchedAt?.toMillis?.() || null,
    },
    salesCount: Number(t.salesCount) || 0,
    weeklyVelocity: Number(t.weeklyVelocity) || 0,
  }
}

async function getTireBySize({ firestore, size, limit = 10 }) {
  const sizeNorm = String(size || '').trim().toUpperCase()
  if (!sizeNorm) return []
  // Catalog stores size inside the description string. Iterate up to `limit*5`
  // candidates and filter by substring match. For v1 this is acceptable;
  // tighten with an indexed `sizeNormalized` field if perf becomes an issue.
  const snap = await firestore.collection('tires')
    .where('archived', '!=', true)
    .limit(limit * 5)
    .get()
  const out = []
  for (const doc of snap.docs) {
    const t = doc.data() || {}
    const desc = String(t.description || '').toUpperCase()
    if (desc.includes(sizeNorm)) {
      out.push({
        mspn: doc.id,
        description: t.description || '',
        brand: t.brand || '',
        lr: t.lr || '',
        price: Number(t.price) || 0,
        fet: Number(t.fet) || 0,
      })
    }
    if (out.length >= limit) break
  }
  return out
}

async function computeLandedCost({ firestore, tire }) {
  const cfgSnap = await firestore.collection('meta').doc('payoutConfig').get()
  const cfg = cfgSnap.exists ? cfgSnap.data() || {} : {}
  const taxes = cfg.taxes || {}
  const landedPerTire = tireLandedBuyNumber(tire || {}, taxes)
  const buy = Number(tire?.price) || 0
  const fet = Number(tire?.fet) || 0
  const taxRate = (Number(taxes.countyTaxPct) || 0)
    + (Number(taxes.localTaxPct) || 0)
    + (Number(taxes.stateTaxPct) || 0)
  return {
    landedPerTire,
    breakdown: {
      catalog: buy,
      fet,
      wholesaleTax: buy * taxRate,
      tireFee: Number(taxes.tireFeePerTire) || 0,
    },
    taxRate,
  }
}

async function getRecentSalesForSize({ firestore, size, limit = 10 }) {
  const sizeNorm = String(size || '').trim().toUpperCase()
  if (!sizeNorm) return []
  const snap = await firestore.collection('orders')
    .where('status', '==', 'completed')
    .orderBy('completedMs', 'desc')
    .limit(limit * 3)
    .get()
  const out = []
  for (const doc of snap.docs) {
    const o = doc.data() || {}
    const sz = String(o.size || o.tireSize || '').toUpperCase()
    if (!sz.includes(sizeNorm)) continue
    out.push({
      orderId: doc.id,
      completedMs: Number(o.completedMs) || 0,
      paymentAmount: Number(o.paymentAmount) || 0,
      quantity: Number(o.quantity) || 0,
      deliveredBy: o.deliveredBy || null,
    })
    if (out.length >= limit) break
  }
  return out
}

module.exports = {
  getTireByMspn,
  getTireBySize,
  computeLandedCost,
  getRecentSalesForSize,
}
module.exports._testonly = { getTireByMspn, getTireBySize, computeLandedCost, getRecentSalesForSize }
