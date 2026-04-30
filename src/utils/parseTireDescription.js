/**
 * Parse common tire size + service-description prefix from catalog description strings.
 * Supports metric (incl. optional P/LT prefix), LT-metric after stripping LT, and flotation (e.g. 31X10.50R15LT).
 *
 * @param {unknown} desc
 * @returns {{
 *   width: number | null,
 *   aspectRatio: number | null,
 *   construction: string | null,
 *   rimDiameter: number | null,
 *   loadIndex: number | null,
 *   loadIndexSecondary: number | null,
 *   speedRating: string | null,
 *   extraLoad: boolean,
 *   treadName: string,
 *   parseKind: 'metric' | 'flotation' | 'raw',
 *   flotationMid: string | null,
 *   trailingLt: boolean,
 *   ltPrefixedMetric: boolean,
 * }}
 */
/** Sidewall codes that BFGoodrich and others slash-attach to the rim spec
 * in eFleet HTML. Stripped wherever they appear so they don't break the
 * metric size + load/speed split. The actual sidewall flag survives via
 * the tag pipeline (deriveTireTags) and the tire's brand metadata. */
const SLASH_PREFIXED_SIDEWALL_RE =
  /\/(?:F|BSW|WSW|OWL|RWL|ORWL|RBL|MS)\b/gi

/** Collapse whitespace; fix common catalog typos so metric/flotation patterns match. */
function normalizeCatalogDescription(s) {
  let t = String(s ?? '')
    .trim()
    .replace(/\s+/g, ' ')
  // Lowercase "r" before rim (265/70r17 → 265/70R17)
  t = t.replace(/(\d{2,3}\/\d{2})r(\d{2}(?:\.\d)?)(?=\s|$)/gi, '$1R$2')
  // Collapse "LT 325/60R20" / "P 215/65R17" -> "LT325/60R20" / "P215/65R17"
  // so the existing leading-prefix lead-regex picks up the LT/P flag.
  t = t.replace(/^(LT|P)\s+(?=\d)/i, (_, kind) => kind.toUpperCase())
  // Drop slash-prefixed sidewall codes (/F, /BSW, /OWL, /RWL, /ORWL, /WSW,
  // /RBL, /MS). They're cosmetic flags on BFG/Michelin eFleet lines and
  // breaking them out keeps the metric regex clean.
  t = t.replace(SLASH_PREFIXED_SIDEWALL_RE, '')
  // Re-collapse whitespace in case stripping left double spaces.
  t = t.replace(/\s+/g, ' ').trim()
  return t
}

export function parseDescription(desc) {
  const raw = normalizeCatalogDescription(desc)
  const empty = {
    width: null,
    aspectRatio: null,
    construction: null,
    rimDiameter: null,
    loadIndex: null,
    loadIndexSecondary: null,
    speedRating: null,
    extraLoad: false,
    treadName: raw,
    parseKind: /** @type {'raw'} */ ('raw'),
    flotationMid: null,
    trailingLt: false,
    ltPrefixedMetric: false,
  }
  if (!raw) return { ...empty, treadName: '', parseKind: 'raw' }

  const extraLoad = /\bXL\b/i.test(raw)

  /**
   * After size token: load index + speed + tread (metric and flotation).
   * Handles spaced form (100 Y XL …) and concatenated (109QTLMDTRTA).
   */
  function parseLoadSpeedTail(rest) {
    const r = String(rest || '').trim()
    let loadIndex = null
    let speedRating = null
    let tail = r

    const spaced = /^(\d{2,3})\s*([A-Z]{1,2})\b\s*(.*)$/i.exec(r)
    if (spaced) {
      loadIndex = Number(spaced[1])
      speedRating = spaced[2].toUpperCase()
      tail = String(spaced[3] || '').trim()
    } else {
      const tight = /^(\d{2,3})([A-Z])(.*)$/i.exec(r)
      if (tight) {
        loadIndex = Number(tight[1])
        speedRating = tight[2].toUpperCase()
        tail = String(tight[3] || '').trim()
      }
    }

    const treadName = tail.replace(/^\s*XL\s+/i, '').trim() || ''
    return {
      loadIndex: Number.isFinite(loadIndex) ? loadIndex : null,
      speedRating,
      treadName,
    }
  }

  // Flotation: optional LT/P prefix, NN(N) x aspect R rim (LT)? remainder.
  // Aspect is `\d+(?:\.\d+)?` so 10.50, 12.5, 12.50 all match (greedy numeric + optional decimal tail).
  const flotRe = /^(LT|P)?(\d{2,3})[xX](\d+(?:\.\d+)?)[rR](\d{2})(LT)?(.*)$/i

  function tryFlotation(s) {
    return s.match(flotRe)
  }

  let fm = tryFlotation(raw)
  if (!fm) {
    const stripped = raw.replace(/^(LT|P)(?=\d{2}[xX])/i, '')
    if (stripped !== raw) fm = tryFlotation(stripped)
  }

  if (fm) {
    const trailingLt = Boolean(fm[5])
    const rest = String(fm[6] != null ? fm[6] : '').trim()
    const ls = parseLoadSpeedTail(rest)
    const rim = Number(fm[4])
    return {
      width: Number(fm[2]),
      aspectRatio: null,
      construction: trailingLt ? 'LT' : null,
      rimDiameter: Number.isFinite(rim) ? rim : null,
      loadIndex: ls.loadIndex,
      loadIndexSecondary: null,
      speedRating: ls.speedRating,
      extraLoad,
      treadName: ls.treadName,
      parseKind: 'flotation',
      flotationMid: String(fm[3]),
      trailingLt,
      ltPrefixedMetric: false,
    }
  }

  // Compressed catalog metric: LT265/70R17/C112/109SATT/AKO3 (optional /C load range, dual load index + speed).
  const compressedRe =
    /^(LT|P)?(\d{2,3})\/(\d{2})(ZR|RF|HR|R|D|B)(\d{2}(?:\.\d)?)(?:\/([A-F]))?(\d{2,3}(?:\/\d{2,3})?)([A-Z]{1,3})(.*)$/i
  const cm = raw.match(compressedRe)
  if (cm) {
    const ltPrefixedMetric = Boolean(cm[1] && /^LT$/i.test(cm[1]))
    const width = Number(cm[2])
    const aspectRatio = Number(cm[3])
    const construction = String(cm[4] || '').toUpperCase()
    const rim = Number(cm[5])
    const loadStr = String(cm[7] || '')
    const dual = loadStr
      .split('/')
      .map((x) => Number(String(x).trim()))
      .filter((n) => Number.isFinite(n) && n > 0)
    const loadIndex = dual.length ? dual[0] : null
    const loadIndexSecondary = dual.length >= 2 ? dual[1] : null
    const speedRating = String(cm[8] || '')
      .toUpperCase()
      .slice(0, 3)
      .replace(/\s+/g, '') || null
    const treadName = String(cm[9] || '')
      .trim()
      .replace(/^\s*XL\s+/i, '')
      .trim()
    return {
      width: Number.isFinite(width) ? width : null,
      aspectRatio: Number.isFinite(aspectRatio) ? aspectRatio : null,
      construction: construction || null,
      rimDiameter: Number.isFinite(rim) ? rim : null,
      loadIndex,
      loadIndexSecondary,
      speedRating,
      extraLoad,
      treadName,
      parseKind: 'metric',
      flotationMid: null,
      trailingLt: false,
      ltPrefixedMetric,
    }
  }

  // Metric: optional leading LT or P (strip before size match); e.g. LT305/65R17 …
  let metricStr = raw
  let ltPrefixedMetric = false
  const lead = /^(LT|P)(?=[0-9/])/i.exec(metricStr)
  if (lead) {
    ltPrefixedMetric = /^LT$/i.test(lead[1])
    metricStr = metricStr.slice(lead[0].length)
  }

  const sizeRe =
    /^(\d{2,3})\/(\d{2})((?:ZR|RF|HR|R|r))(\d{2}(?:\.\d)?)\s*(.*)$/i
  const m = metricStr.match(sizeRe)
  if (!m) {
    return { ...empty, extraLoad, treadName: raw, parseKind: 'raw' }
  }

  const rest = String(m[5] || '').trim()
  const ls = parseLoadSpeedTail(rest)
  const rim = m[4].includes('.') ? Number(m[4]) : Number(m[4])

  return {
    width: Number(m[1]),
    aspectRatio: Number(m[2]),
    construction: String(m[3] || '').toUpperCase(),
    rimDiameter: Number.isFinite(rim) ? rim : null,
    loadIndex: ls.loadIndex,
    loadIndexSecondary: null,
    speedRating: ls.speedRating,
    extraLoad,
    treadName: ls.treadName,
    parseKind: 'metric',
    flotationMid: null,
    trailingLt: false,
    ltPrefixedMetric,
  }
}
