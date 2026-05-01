import { buildListingScript } from './listingGenerator.js'
import { parseDescription } from './parseTireDescription.js'

const SIDEWALL_PILL_KEYS = new Set(['XL', 'MS'])

const PLATFORMS = [
  { key: 'facebook',   label: 'Facebook Marketplace' },
  { key: 'offerup',    label: 'OfferUp' },
  { key: 'craigslist', label: 'Craigslist' },
]

function normalizeBrand(raw) {
  const s = String(raw ?? '').trim().toUpperCase()
  if (!s) return ''
  if (s === 'BFG') return 'BFGOODRICH'
  return s
}

function buildSizeSpec(tire) {
  const desc = String(tire?.description ?? '').trim()
  if (!desc) return null
  const parsed = parseDescription(desc)
  if (parsed.parseKind === 'raw') return null
  const loadParts = []
  if (parsed.loadIndex != null) loadParts.push(String(parsed.loadIndex))
  if (parsed.speedRating) loadParts.push(parsed.speedRating)
  if (parsed.parseKind === 'flotation' && parsed.width != null && parsed.flotationMid != null && parsed.rimDiameter != null) {
    const ltSuffix = parsed.trailingLt ? 'LT' : ''
    const size = `${parsed.width}X${parsed.flotationMid}R${parsed.rimDiameter}${ltSuffix}`
    return loadParts.length ? `${size} ${loadParts.join(' ')}` : size
  }
  if (parsed.parseKind === 'metric' && parsed.width != null && parsed.aspectRatio != null && parsed.rimDiameter != null) {
    const construction = String(parsed.construction || '').toUpperCase()
    const lt = parsed.ltPrefixedMetric ? 'LT' : ''
    const size = `${lt}${parsed.width}/${parsed.aspectRatio}${construction}${parsed.rimDiameter}`
    return loadParts.length ? `${size} ${loadParts.join(' ')}` : size
  }
  return null
}

/**
 * @typedef {Object} ListingEntry
 * @property {string} sku
 * @property {string} brand
 * @property {string} mpn
 * @property {'new'} condition
 * @property {number} qty
 * @property {number} price
 * @property {string | null} category
 * @property {string | null} sizeSpec
 * @property {string} treadFamily
 * @property {string[]} sidewallTags
 * @property {string[]} photos
 * @property {{ facebook: { title, description }, offerup: { title, description }, craigslist: { title, description } }} copy
 */

/**
 * Build platform-agnostic listing entries from selected tires.
 *
 * @param {Array<{ tire: Record<string, unknown>, qty: number, pricePer: number }>} entries
 * @returns {Array<ListingEntry>}
 */
export function buildListingMetadata(entries) {
  const out = []
  for (const e of Array.isArray(entries) ? entries : []) {
    const tire = e?.tire || {}
    const qty = Math.max(1, Number(e?.qty) || 1)
    const price = Math.max(0, Number(e?.pricePer) || 0)
    const sku = String(tire.mspn ?? '').trim()
    const sidewallTags = Array.isArray(tire.derivedUseTags)
      ? tire.derivedUseTags.filter((t) => SIDEWALL_PILL_KEYS.has(t))
      : []
    const photos = Array.isArray(tire.photos)
      ? tire.photos.map((p) => String(p ?? '')).filter(Boolean)
      : []
    const copy = {}
    for (const { key, label } of PLATFORMS) {
      copy[key] = buildListingScript({ tire, qty, pricePer: price, platform: label })
    }
    out.push({
      sku,
      brand: normalizeBrand(tire.brand),
      mpn: sku,
      condition: 'new',
      qty,
      price,
      category: tire.category ?? null,
      sizeSpec: buildSizeSpec(tire),
      treadFamily: String(tire.tread ?? '').trim(),
      sidewallTags,
      photos,
      copy,
    })
  }
  return out
}

/**
 * Minimal RFC-4180-compliant CSV serializer. Wraps any field containing
 * `,`, `"`, `\n`, or `\r` in double-quotes; doubles internal double-quotes.
 *
 * Empty input + columns hint -> header row only.
 * Empty input + no columns hint -> empty string.
 *
 * @param {Array<Record<string, unknown>>} rows
 * @param {Array<string>} [columns]
 * @returns {string}
 */
export function toCsv(rows, columns) {
  const cols = columns || (rows.length > 0 ? Object.keys(rows[0]) : null)
  if (!cols) return ''
  const lines = [cols.join(',')]
  for (const row of rows) {
    lines.push(cols.map((c) => csvCell(row[c])).join(','))
  }
  return lines.join('\n')
}

function csvCell(v) {
  if (v == null) return ''
  const s = String(v)
  if (s === '') return ''
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}
