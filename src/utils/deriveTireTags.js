import { parseDescription } from './parseTireDescription.js'

/**
 * Derive a de-duplicated, sorted array of filter tags from a tire document.
 *
 * Inspects `brand`, `description`, `tread`, `mspn`, `lr`, and any existing
 * `useTags`. Tag families: use-type (AT/HT/MT/UHP/Touring/Performance),
 * season (Winter/All-Season/Summer), vehicle class/construction
 * (LT/P-Metric/Flotation/Commercial/XL/RunFlat/Studdable), load range
 * (LR-<letter>), and speed rating letter. Never mutates input, never throws.
 *
 * @param {Record<string, unknown> | null | undefined} tire
 * @returns {string[]}
 */
export function deriveTireTags(tire) {
  if (!tire || typeof tire !== 'object') return []

  const brand = safeStr(tire.brand)
  const description = safeStr(tire.description)
  const tread = safeStr(tire.tread)
  const mspn = safeStr(tire.mspn)
  const lr = safeStr(tire.lr).trim()
  const existing = Array.isArray(tire.useTags)
    ? tire.useTags.map((x) => safeStr(x).trim()).filter(Boolean)
    : []

  // Haystack for most heuristics: description + tread + brand.
  // mspn joined too so tread-coded mspns can still hit use-type regexes.
  const hay = `${description} ${tread} ${brand} ${mspn}`

  const out = new Set()

  // Existing explicit tags always survive.
  for (const t of existing) out.add(t)

  // Use-type / tread family.
  if (RE_AT.test(hay)) out.add('AT')
  if (RE_HT.test(hay)) out.add('HT')
  if (RE_MT.test(hay)) out.add('MT')
  if (RE_UHP.test(hay)) out.add('UHP')
  if (RE_PASSENGER_TOURING.test(hay)) out.add('Touring')

  // Season tags.
  if (RE_WINTER.test(hay)) out.add('Winter')
  if (RE_ALL_SEASON.test(hay)) out.add('All-Season')
  if (RE_SUMMER.test(hay)) out.add('Summer')

  // Vehicle class / construction. Parse once so we can reuse for LT/flotation.
  const parsed = safeParse(description)

  // LT: description starts with "LT " or has LT\d (compressed catalog) OR
  // parser detected a trailing LT (flotation) / LT-prefixed metric.
  const hasTrailingLt = !!(parsed && parsed.trailingLt)
  const hasLtPrefixed = !!(parsed && parsed.ltPrefixedMetric)
  if (RE_LT_DESC.test(description) || hasTrailingLt || hasLtPrefixed) {
    out.add('LT')
  }
  if (RE_P_METRIC.test(description)) out.add('P-Metric')
  if (RE_FLOTATION.test(description) || (parsed && parsed.parseKind === 'flotation')) {
    out.add('Flotation')
  }
  if (RE_COMMERCIAL.test(description)) out.add('Commercial')
  if (RE_XL.test(description)) out.add('XL')
  if (RE_RUNFLAT.test(hay)) out.add('RunFlat')
  if (RE_STUDDABLE.test(hay)) out.add('Studdable')

  // Load range as tag (e.g. LR-D, LR-E).
  if (lr) {
    const letter = lr.replace(/[^A-Za-z]/g, '').toUpperCase()
    if (letter) out.add(`LR-${letter}`)
  }

  // Speed rating — from parser if available, else fall back to text probe.
  const sr = parsed && parsed.speedRating
    ? String(parsed.speedRating).toUpperCase()
    : parseSpeedRatingFallback(description)
  if (sr) {
    // Performance bucket on fast passenger tires.
    if (sr === 'W' || sr === 'Y' || sr === 'Z' || sr === 'ZR') {
      out.add('Performance')
    }
    // Emit the letter itself as a tag (drop ZR to Z).
    const letter = sr === 'ZR' ? 'Z' : sr
    // Skip low-speed truck ratings unless they're all we have.
    if (/^[STHVWY]$/.test(letter) || letter === 'Z') {
      out.add(letter)
    } else if (/^[LMNPQR]$/.test(letter) && out.size === existing.length) {
      // Fallback: only include low-speed letter if nothing else was derived.
      out.add(letter)
    }
  }

  // Normalize — dedupe case-insensitively, preferring canonical capitalization
  // when both exist (e.g. existing `custom` + derived `AT`).
  const lower = new Map()
  for (const t of out) {
    const key = t.toLowerCase()
    if (!lower.has(key)) lower.set(key, t)
  }

  return [...lower.values()].sort((a, b) => a.localeCompare(b))
}

function safeStr(v) {
  return v == null ? '' : String(v)
}

/**
 * Defensive wrapper around `parseDescription`. Returns null on any throw.
 * @param {string} description
 */
function safeParse(description) {
  if (!description) return null
  try {
    return parseDescription(description)
  } catch {
    return null
  }
}

/**
 * Fallback speed-rating probe for descriptions that don't parse cleanly.
 * Conservative — avoids false positives on load-range letters.
 * @param {string} description
 * @returns {string | null}
 */
function parseSpeedRatingFallback(description) {
  if (!description) return null
  if (/\b\d{2,3}\/\d{2}ZR\d{2}/i.test(description)) return 'Z'
  const m = /\b(\d{2,3})\s*([STHVWY])\b/i.exec(description)
  if (m) return m[2].toUpperCase()
  return null
}

// --- Use-type regexes ------------------------------------------------------
// AT: All-terrain family — includes KO2/KO3 and Duratrac specifically.
const RE_AT =
  /\b(?:ATT|AKO|AT|A\/T|KO2|KO3|Duratrac|ATTakpro|All-?Terrain)\b/i
// HT: truck/SUV highway tires. `Touring` here is the truck-touring "HT" family.
const RE_HT =
  /\b(?:LTX|Defender|Energy|CruGen|Latitude|HiScrbr|HT|HighWay|Touring)\b/i
// MT: mud-terrain. `KO(?!2|3)` so bare "KO" triggers but KO2/KO3 do not.
const RE_MT =
  /\b(?:MT|MTZ|Baja|KM3|KO(?!2|3)|Mudder|Mud-?Terrain)\b/i
const RE_UHP =
  /\b(?:PS4|Pilot.?Sport|G-?Force|F1|Eagle|Potenza|CompetitionYok|PilotSuperSport|Cup)\b/i

// Passenger grand-tour bucket — distinct from HT (which is truck-oriented).
// Detects "GrandTouring"/"GT"/"Passenger" tokens.
const RE_PASSENGER_TOURING = /\b(?:GrandTouring|GT|Passenger)\b/i

// --- Season ---------------------------------------------------------------
const RE_WINTER =
  /(?:\bWinter\b|\bSnow\b|\bIce\b|3PMSF|\bXIce\b|Blizzak(?:X)?|Hakkapeliitta(?:X)?|Nokian[^,]*Hak|\bAlpin\b)/i
const RE_ALL_SEASON = /(?:M\+S|M\/S|\bMS2\b|\bAS\b|AllSeason)/i
const RE_SUMMER = /\b(?:Summer)\b/i

// --- Vehicle class / construction -----------------------------------------
// "description starts with LT " OR brand description has LT\d pattern.
const RE_LT_DESC = /^\s*LT\s+|\bLT\d/i
const RE_P_METRIC = /^\s*P\d/i
const RE_FLOTATION = /\d{2,3}X\d{1,2}(?:\.\d+)?/i
const RE_COMMERCIAL = /(?:\b11R22\.5\b|\bR22\.5\b|\bLRH\b|\bLRG\b|\bTBR\b)/i
const RE_XL = /\bXL\b/i
const RE_RUNFLAT = /\b(?:RunFlat|Run-?Flat|ZP|SSR|MOE|ROF)\b/i
const RE_STUDDABLE = /\b(?:Studded|Studdable|Stud)\b/i
