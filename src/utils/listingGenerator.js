import { formatCurrency } from './format'

const REASONS = [
  'Upgrading to a different spec for our fleet.',
  'Ordered extras — don’t need them all.',
  'Bought more than we ended up needing.',
  'Fleet downsize — these never got used.',
  'Had these as backup — switching suppliers.',
  'Switching tire sizes across the board.',
  'These came in from a bulk order we’re clearing out.',
  'Bought a set to have on hand, ended up not needing them.',
  'Clearing out storage space — priced to move.',
  'Part of a larger lot we’re breaking down.',
  'Inventory refresh — making room for new stock.',
  'Specs changed on a few rigs — these are surplus.',
  'Vendor mix-up left us with extras.',
  'Seasonal rotation — offloading what we won’t mount.',
  'Trial batch didn’t match our usual route profiles.',
  'Shop consolidation — duplicate SKUs need to go.',
  'Fleet standardization — odd sizes are extras now.',
  'Customer order change left these unmounted.',
  'Warehouse cleanup after a recent audit.',
  'Promo overbuy — passing savings along.',
  'New contract tires arrived early — these are redundant.',
  'Moved to a different tread pattern for fuel savings.',
  'Regional route changes — fewer units on this size.',
]

const SESSION_KEY = 'skedaddle-listing-reasons-used'

export function pickReasonForSession() {
  if (typeof sessionStorage === 'undefined') {
    return REASONS[Math.floor(Math.random() * REASONS.length)]
  }
  let used = []
  try {
    used = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]')
  } catch {
    used = []
  }
  const available = REASONS.map((_, i) => i).filter((i) => !used.includes(i))
  let idx
  if (available.length === 0) {
    used = []
    idx = Math.floor(Math.random() * REASONS.length)
  } else {
    idx = available[Math.floor(Math.random() * available.length)]
  }
  used.push(idx)
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(used))
  return REASONS[idx]
}

/** Random month/year in the last 6 months (inclusive), formatted MM/YYYY */
export function randomDotMonthYear() {
  const end = new Date()
  const start = new Date(end)
  start.setMonth(start.getMonth() - 6)
  const t =
    start.getTime() + Math.random() * (end.getTime() - start.getTime())
  const d = new Date(t)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${mm}/${yyyy}`
}

const PLATFORM_HINTS = {
  'Facebook Marketplace': 'Friendly, local-community tone.',
  OfferUp: 'Short, direct mobile marketplace tone.',
  Craigslist: 'Straightforward classifieds tone.',
  eBay: 'Professional resale tone with clear specs.',
}

function tireUseCaseLine(tire) {
  const tags = Array.isArray(tire.useTags) ? tire.useTags : []
  if (tags.length) {
    const pretty = tags.map((t) => t.replace(/-/g, ' ')).join(', ')
    return `Perfect for ${pretty} applications.`
  }
  if (tire.category) {
    return `Great fit for ${tire.category.toLowerCase()} duty.`
  }
  return 'Ideal for commercial trucks and fleet use.'
}

/**
 * @param {object} params
 * @param {object} params.tire Firestore tire doc fields
 * @param {number} params.qty
 * @param {number} params.pricePer
 * @param {string} params.platform
 */
export function buildListingScript({ tire, qty, pricePer, platform }) {
  const reason = pickReasonForSession()
  const dot = randomDotMonthYear()
  const total = qty * pricePer
  const brand = tire.brand || 'Tire'
  const desc = tire.description || ''
  const mspn = tire.mspn || ''
  const tread = tire.tread || ''

  const title = `${qty}x ${brand} ${desc}${tread ? ` (${tread})` : ''} - [${mspn}]`
    .replace(/\s+/g, ' ')
    .trim()

  const platformNote = PLATFORM_HINTS[platform] || ''
  const opener =
    platform === 'eBay'
      ? `${qty}x ${brand} ${desc} tires, stored properly and ready to mount.`
      : `${qty}x ${brand} ${desc} tires in great condition.`

  const description = [
    opener,
    '',
    `DOT: ${dot} ✅`,
    '',
    reason,
    '',
    tireUseCaseLine(tire),
    '',
    `💰 ${formatCurrency(pricePer)} each / ${formatCurrency(total)} for the set`,
    `📦 SKU: ${mspn}`,
    '',
    platformNote
      ? `(Listing tone: ${platformNote.replace(/\.$/, '')}.)`
      : 'These are hard to find at this price. Don’t miss out.',
    '',
    'Local pickup or can arrange delivery. Message with questions!',
  ].join('\n')

  return { title, description }
}
