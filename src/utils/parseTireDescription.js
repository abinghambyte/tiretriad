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
 *   speedRating: string | null,
 *   extraLoad: boolean,
 *   treadName: string,
 *   parseKind: 'metric' | 'flotation' | 'raw',
 *   flotationMid: string | null,
 *   trailingLt: boolean,
 *   ltPrefixedMetric: boolean,
 * }}
 */
export function parseDescription(desc) {
  const raw = String(desc ?? '').trim()
  const empty = {
    width: null,
    aspectRatio: null,
    construction: null,
    rimDiameter: null,
    loadIndex: null,
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

  function parseLoadSpeedTail(rest) {
    const r = String(rest || '').trim()
    const loadSpeed = /^(\d{2,3})\s*([A-Z]{1,2})\b\s*(.*)$/i.exec(r)
    let loadIndex = null
    let speedRating = null
    let tail = r
    if (loadSpeed) {
      loadIndex = Number(loadSpeed[1])
      speedRating = loadSpeed[2].toUpperCase()
      tail = String(loadSpeed[3] || '').trim()
    }
    let treadName = tail.replace(/^\s*XL\s+/i, '').trim() || raw
    return {
      loadIndex: Number.isFinite(loadIndex) ? loadIndex : null,
      speedRating,
      treadName,
    }
  }

  // Flotation: 31X10.50R15LT … or LT31X10.50R15LT … or 37X12.5R18LT …
  const flotRe = /^(\d{2})X(\d{1,2}\.\d{1,2})R(\d{2})(LT)?(?:\s+(.*))?$/i
  function tryFlotation(s) {
    return s.match(flotRe)
  }
  let fm = tryFlotation(raw)
  if (!fm) {
    const stripped = raw.replace(/^(LT|P)(?=\d{2}X)/i, '')
    if (stripped !== raw) fm = tryFlotation(stripped)
  }
  if (fm) {
    const trailingLt = Boolean(fm[4])
    const rest = String(fm[5] != null ? fm[5] : '').trim()
    const ls = parseLoadSpeedTail(rest)
    const rim = Number(fm[3])
    return {
      width: Number(fm[1]),
      aspectRatio: null,
      construction: trailingLt ? 'LT' : null,
      rimDiameter: Number.isFinite(rim) ? rim : null,
      loadIndex: ls.loadIndex,
      speedRating: ls.speedRating,
      extraLoad,
      treadName: ls.treadName,
      parseKind: 'flotation',
      flotationMid: String(fm[2]),
      trailingLt,
      ltPrefixedMetric: false,
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
    /^(\d{2,3})\/(\d{2})((?:ZR|RF|HR|R))(\d{2}(?:\.\d)?)\s+(.*)$/i
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
    speedRating: ls.speedRating,
    extraLoad,
    treadName: ls.treadName,
    parseKind: 'metric',
    flotationMid: null,
    trailingLt: false,
    ltPrefixedMetric,
  }
}
