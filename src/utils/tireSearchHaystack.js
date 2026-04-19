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

function normalizeTokens(rawQuery) {
  return String(rawQuery ?? '')
    .toLowerCase()
    .split(/[\s/]+/)
    .map((t) => t.replace(/[^a-z0-9]+/g, ''))
    .filter((t) => t.length >= 2)
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
  const q = normalizeQuery(rawQuery)
  if (!q) return true
  const hay = normalizeQuery(buildTireHaystack(tire))
  if (!hay) return false
  if (hay.includes(q)) return true
  if (q.length < 4) return false
  const tokens = normalizeTokens(rawQuery)
  if (tokens.length === 0) return false
  return tokens.every((t) => hay.includes(t))
}
