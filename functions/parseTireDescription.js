'use strict'

/**
 * Parse common tire size + service-description prefix from catalog description strings.
 * Mirrors `src/utils/parseTireDescription.js` (CommonJS for Cloud Functions).
 *
 * @param {unknown} desc
 */
function parseDescription(desc) {
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

    const treadName = tail.replace(/^\s*XL\s+/i, '').trim() || raw
    return {
      loadIndex: Number.isFinite(loadIndex) ? loadIndex : null,
      speedRating,
      treadName,
    }
  }

  const flotRe = /^(LT|P)?(\d{2,3})X(\d+(?:\.\d+)?)R(\d{2})(LT)?(.*)$/i

  function tryFlotation(s) {
    return s.match(flotRe)
  }

  let fm = tryFlotation(raw)
  if (!fm) {
    const stripped = raw.replace(/^(LT|P)(?=\d{2}X)/i, '')
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
      speedRating: ls.speedRating,
      extraLoad,
      treadName: ls.treadName,
      parseKind: 'flotation',
      flotationMid: String(fm[3]),
      trailingLt,
      ltPrefixedMetric: false,
    }
  }

  let metricStr = raw
  let ltPrefixedMetric = false
  const lead = /^(LT|P)(?=[0-9/])/i.exec(metricStr)
  if (lead) {
    ltPrefixedMetric = /^LT$/i.test(lead[1])
    metricStr = metricStr.slice(lead[0].length)
  }

  const sizeRe = /^(\d{2,3})\/(\d{2})((?:ZR|RF|HR|R))(\d{2}(?:\.\d)?)\s+(.*)$/i
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

module.exports = { parseDescription }
