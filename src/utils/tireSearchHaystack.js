import { parseDescription } from './parseTireDescription.js'
import { deriveTireTags } from './deriveTireTags.js'

/**
 * Per-tire search haystack memo. WeakMap keyed on the tire document object so
 * entries clear automatically when the underlying row is replaced (e.g. on a
 * Firestore snapshot update).
 * @type {WeakMap<object, string>}
 */
const haystackCache = new WeakMap()

function str(v) {
  return v == null ? '' : String(v)
}

function safeParse(desc) {
  try {
    return parseDescription(desc)
  } catch {
    return null
  }
}

/**
 * Build a single string that contains every field a user is likely to type
 * when searching for a tire: the raw description, tread, brand, MSPN,
 * every parsed size component, the load range letter, and every derived tag.
 * The returned string is normalized the same way `normalizeQuery` normalizes
 * user input so `matchesQuery` can do a compact substring check.
 *
 * Caches per tire object via WeakMap — a tire that hasn't changed returns
 * the same string without re-parsing. At 1,160 tires and a 12 ms budget per
 * keystroke this matters.
 *
 * @param {Record<string, unknown> | null | undefined} tire
 * @returns {string}
 */
export function buildTireHaystack(tire) {
  if (!tire || typeof tire !== 'object') return ''
  const cached = haystackCache.get(tire)
  if (cached != null) return cached

  const description = str(tire.description)
  const parsed = description ? safeParse(description) : null

  const parts = [
    description,
    str(tire.tread),
    str(tire.brand),
    str(tire.mspn),
    str(tire.lr),
    // Include a "LR-<letter>" form so users can type "lr-c" in the search box
    // and land on every tire with that load range, even though the derived-tag
    // list intentionally omits LR-* entries (the dedicated LR filter chip row
    // already covers that dimension).
    tire.lr ? `LR-${str(tire.lr).trim().toUpperCase()}` : '',
  ]

  if (parsed) {
    if (parsed.width != null) parts.push(String(parsed.width))
    if (parsed.aspectRatio != null) parts.push(String(parsed.aspectRatio))
    if (parsed.flotationMid != null) parts.push(String(parsed.flotationMid))
    if (parsed.construction) parts.push(String(parsed.construction))
    if (parsed.rimDiameter != null) parts.push(String(parsed.rimDiameter))
    if (parsed.loadIndex != null) parts.push(String(parsed.loadIndex))
    if (parsed.loadIndexSecondary != null) {
      parts.push(String(parsed.loadIndexSecondary))
    }
    if (parsed.speedRating) parts.push(String(parsed.speedRating))
    if (parsed.treadName) parts.push(String(parsed.treadName))
    if (parsed.trailingLt) parts.push('LT')
    if (parsed.ltPrefixedMetric) parts.push('LT')
  }

  let tags = []
  try {
    tags = deriveTireTags(tire)
  } catch {
    tags = []
  }
  for (const t of tags) parts.push(str(t))

  const joined = parts.filter(Boolean).join(' ')
  haystackCache.set(tire, joined)
  return joined
}

/**
 * Normalize a search query or haystack string: lowercase, strip every
 * non-alphanumeric character (spaces, slashes, dots, dashes, asterisks,
 * bullet-dots, etc.). Returns a compact ASCII string.
 *
 * Example:
 *   "32X11.50R15LT /C 113R ATT/A KO3" → "32x1150r15ltc113rattako3"
 *
 * @param {unknown} s
 * @returns {string}
 */
export function normalizeQuery(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

/**
 * Strip verbose spec phrases and cosmetic sidewall codes that retailers include
 * in product titles but the Skedaddle catalog omits. Without this, pastes from
 * Tire Rack / Discount Tire / eBay miss via the token-fallback path because
 * tokens like "bsw" or "ply" do not appear in the catalog haystack.
 *
 * Handled:
 *   - "Load Range E" / "load range e" → "E"
 *   - "E-range" / "E Range" → "E"
 *   - "10-ply" / "10 ply" / "10 Ply Rated" → ""
 *   - Sidewall codes as standalone words: BSW, OWL, ROWL, RBL, WWL, SBL, etc.
 *   - Leading "P" on passenger metric: "P225/70R15" → "225/70R15"
 *     (catalog drops the P for passenger metric so including it is a miss).
 *     "LT" prefix is intentionally preserved since it distinguishes
 *     light-truck sizes and catalog entries carry it.
 *
 * Preserves all other content (including load-range letters, speed ratings,
 * and tread names).
 *
 * @param {unknown} raw
 * @returns {string}
 */
export function stripVerbosePhrases(raw) {
  let s = String(raw ?? '')
  // Slash-attached sidewall codes (e.g. "265/70R17/BSW") — same vocabulary as
  // standalone words but many retailer pastes glue them to the rim token.
  s = s.replace(
    /\/(?:(?:bsw|ww|rbl|owl|rowl|rwl|wwl|sbl|blk|bw))(?=[\s/]|$)/gi,
    '',
  )
  // Drop a lone leading 'P' on passenger metric. Anchored before 3-digit width
  // + aspect + construction letter so "P295/75R22" strips but arbitrary "P" in
  // tread names (e.g., "PRO-STREET") survives.
  s = s.replace(/\bP(?=\d{3}\/\d{2}[A-Z])/gi, '')
  // "Load Range E" → "E" (keeps the letter that actually matters)
  s = s.replace(/\bload\s+range\s+/gi, '')
  // "E-range" / "E Range" → "E"
  s = s.replace(/\b([A-Z])[\s-]*range\b/gi, '$1')
  // "10-ply", "10 ply", "10-Ply Rated", "10 ply rated"
  s = s.replace(/\b\d+\s*[-\s]*ply(?:\s+rated)?\b/gi, '')
  // Standalone sidewall codes: BSW, OWL, ROWL, RBL, WOWL, WWL, SBL, BLK, BW, WW
  s = s.replace(/\b(?:bsw|owl|rowl|rbl|wowl|wwl|sbl|blk|bw|ww|rwl)\b/gi, '')
  // Normalize LT + load-range letter ordering so pastes align with catalog LR-* haystack tokens.
  // 225/75R16 LT E → LT225/75R16 LR-E
  s = s.replace(/\b(\d{3}\/\d{2}R\d{2}(?:\.\d)?)\s+LT\s+([A-F])\b/gi, 'LT$1 LR-$2')
  // LT225/75R16 E (single LR letter after size; not "110S" style load+speed)
  s = s.replace(/\bLT\s*(\d{3}\/\d{2}R\d{2}(?:\.\d)?)\s+([A-F])(?!\d)\b/gi, 'LT$1 LR-$2')
  // LT225/75R16E → LT225/75R16 LR-E (must run before the bare-metric glued pattern below)
  s = s.replace(
    /\bLT(\d{3}\/\d{2}R\d{2}(?:\.\d)?)([A-F])(?=\s|$|[^\w./])(?!\d)/gi,
    'LT$1 LR-$2',
  )
  // 225/75R16E → 225/75R16 LR-E (load range glued to rim; A–F only; no leading LT)
  s = s.replace(
    /(\d{3}\/\d{2}R\d{2}(?:\.\d)?)([A-F])(?=\s|$|[^\w./])(?!\d)/gi,
    '$1 LR-$2',
  )
  // Collapse multi-spaces introduced by removals
  return s.replace(/\s+/g, ' ').trim()
}

function normalizeTokens(rawQuery) {
  const stripped = stripVerbosePhrases(rawQuery)
  const pieces = stripped
    .toLowerCase()
    .split(/[\s/]+/)
    .map((t) => t.replace(/[^a-z0-9]+/g, ''))
    .filter((t) => t.length >= 2)

  /** Isolated speed letter Q–Y after a 2–3 digit load index (regex-only; no dictionary). */
  const speedLetters = new Set()
  const spacedSpeed = /\b(\d{2,3})\s+([Q-Y])\b/gi
  let sm
  while ((sm = spacedSpeed.exec(stripped)) != null) {
    speedLetters.add(sm[2].toLowerCase())
  }

  const out = [...pieces]
  for (const letter of speedLetters) {
    if (!out.includes(letter)) out.push(letter)
  }
  return out
}

/**
 * Decide whether a tire row should be included for a given raw search query.
 * Two-pass strategy:
 *
 *   1. Normalize both the haystack and the query (strip all non-alphanumerics)
 *      and do a substring check. Catches the "paste a messy description"
 *      case where delimiters, whitespace, and caps don't line up.
 *   2. If the normalized query is 4+ chars and the substring check missed,
 *      fall back to word-token matching: every 2+ char token from the raw
 *      query must appear somewhere in the normalized haystack. This catches
 *      pastes where extra stray characters cause a false miss in the
 *      compact-substring pass.
 *
 * Empty / whitespace-only queries return true (caller should typically skip
 * the check in that case, but we don't want to accidentally filter everything
 * out when the input is blank).
 *
 * @param {Record<string, unknown> | null | undefined} tire
 * @param {unknown} rawQuery
 * @returns {boolean}
 */
export function matchesQuery(tire, rawQuery) {
  const stripped = stripVerbosePhrases(rawQuery)
  const q = normalizeQuery(stripped)
  if (!q) return true
  const hay = normalizeQuery(buildTireHaystack(tire))
  if (!hay) return false
  if (hay.includes(q)) return true
  if (q.length < 4) return false
  const tokens = normalizeTokens(stripped)
  if (tokens.length === 0) return false
  return tokens.every((t) => hay.includes(t))
}
