/**
 * Parse common tire size + service-description prefix from catalog description strings.
 * Example: "255/40ZR19 100Y XL G-FORCE COMP-2 A/S PLUS"
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
  }
  if (!raw) return { ...empty, treadName: '' }

  const extraLoad = /\bXL\b/i.test(raw)

  // Size: 255/40ZR19 or 255/55R18 (construction ends with R before rim diameter)
  const sizeRe =
    /^(?:P)?(\d{2,3})\/(\d{2})((?:ZR|RF|HR|R))(\d{2}(?:\.\d)?)\s+(.*)$/i
  const m = raw.match(sizeRe)
  if (!m) {
    return { ...empty, extraLoad, treadName: raw }
  }

  const rest = String(m[5] || '').trim()
  const loadSpeed = /^(\d{2,3})\s*([A-Z]{1,2})\b\s*(.*)$/i.exec(rest)
  let loadIndex = null
  let speedRating = null
  let tail = rest
  if (loadSpeed) {
    loadIndex = Number(loadSpeed[1])
    speedRating = loadSpeed[2].toUpperCase()
    tail = String(loadSpeed[3] || '').trim()
  }

  let treadName = tail.replace(/^\s*XL\s+/i, '').trim() || raw
  const rim = m[4].includes('.') ? Number(m[4]) : Number(m[4])

  return {
    width: Number(m[1]),
    aspectRatio: Number(m[2]),
    construction: String(m[3] || '').toUpperCase(),
    rimDiameter: Number.isFinite(rim) ? rim : null,
    loadIndex: Number.isFinite(loadIndex) ? loadIndex : null,
    speedRating,
    extraLoad,
    treadName,
  }
}
