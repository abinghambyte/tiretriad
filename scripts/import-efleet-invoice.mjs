/**
 * Parse a Michelin eFleet invoice HTML page into structured data.
 * Pure function - no Firestore writes, no file I/O.
 *
 * @param {string} html
 * @returns {{
 *   docNumber: string,
 *   invoiceDate: string | null,
 *   docDate: string | null,
 *   poNumber: string | null,
 *   orderNumber: string | null,
 *   dr: string,
 *   lines: Array<{
 *     mspn: string,
 *     qty: number,
 *     unitPrice: number,
 *     discount: number,
 *     netUnitPrice: number,
 *     unitFet: number,
 *     extended: number,
 *   }>,
 *   countyTax: number,
 *   localTax: number,
 *   stateTax: number,
 *   tireFee: number,
 *   bonusTotal: number,
 *   nobonusTotal: number,
 *   fetTotal: number,
 *   invoiceTotal: number,
 * }}
 */
export function parseEfleetInvoice(html) {
  if (!html || typeof html !== 'string' || html.trim() === '') {
    throw new Error('parseEfleetInvoice: empty input')
  }

  const docNumber = findCellAfterLabel(html, 'Invoice')
  const dr = findCellAfterLabel(html, 'Cross Reference')
  if (!docNumber || !dr) {
    throw new Error(
      'parseEfleetInvoice: malformed input - missing Invoice or Cross Reference fields',
    )
  }

  const invoiceDate = parseDocDate(findCellAfterLabel(html, 'Date'))
  const docDate = parseDocDate(findCellAfterLabel(html, 'Document Date'))
  const poNumber = findCellAfterLabel(html, 'PO#')
  const orderNumber = findCellAfterLabel(html, 'Order #')

  const lines = parseLines(html)
  if (lines.length === 0) {
    throw new Error('parseEfleetInvoice: malformed input - no invoice lines found')
  }

  return {
    docNumber,
    invoiceDate,
    docDate,
    poNumber,
    orderNumber,
    dr,
    lines,
    countyTax: findMoneyContaining(html, 'COUNTY TAX'),
    localTax: findMoneyContaining(html, 'LOCAL TAX'),
    stateTax: findMoneyContaining(html, 'STATE TAX'),
    tireFee: findMoneyContaining(html, 'TIRE FEE'),
    bonusTotal: findMoneyContaining(html, 'Bonus Total'),
    nobonusTotal: findMoneyContaining(html, 'No Bonus Total'),
    fetTotal: findMoneyContaining(html, 'F.E.T. Total'),
    invoiceTotal: findMoneyContaining(html, 'Invoice Total'),
  }
}

function clean(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseMoney(s) {
  if (s == null) return 0
  const raw = String(s).trim()
  const negative = raw.endsWith('-')
  const stripped = raw.replace(/[$,\s]/g, '').replace(/-$/, '')
  const n = Number(stripped)
  if (!Number.isFinite(n)) return 0
  return negative ? -n : n
}

function parseDocDate(s) {
  const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!m) return null
  const mm = String(m[1]).padStart(2, '0')
  const dd = String(m[2]).padStart(2, '0')
  return `${m[3]}-${mm}-${dd}`
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
}

/**
 * Find the literal label and return the cleaned content of the nearest
 * following <td>. Tries to match the most-specific label first by anchoring
 * to a tag boundary so e.g. "Date" doesn't match "Document Date".
 */
function findCellAfterLabel(html, label) {
  const esc = escapeRegex(label)
  // Anchor on a tag boundary (>) immediately preceding the label so
  // "Date" doesn't match "Document Date" and "Invoice" doesn't match
  // "Invoice Total".
  const re = new RegExp(
    `>\\s*${esc}\\s*<[\\s\\S]*?<td[^>]*>([\\s\\S]*?)<\\/td>`,
    'i',
  )
  const m = html.match(re)
  return m ? clean(m[1]) : null
}

function findMoneyAfterLabel(html, label) {
  const c = findCellAfterLabel(html, label)
  return c ? parseMoney(c) : 0
}

/**
 * Aggregate / total rows look like `<td>A4129 COUNTY TAX COLORADO</td><td>$44.04</td>`
 * - the label is embedded inside the cell text rather than being a clean
 * <th>/<td> match. Search for the label as a substring then take the next
 * <td>.
 */
function findMoneyContaining(html, label) {
  const esc = escapeRegex(label)
  const re = new RegExp(
    `${esc}[\\s\\S]*?<\\/td>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`,
    'i',
  )
  const m = html.match(re)
  return m ? parseMoney(clean(m[1])) : 0
}

function parseLines(html) {
  const lines = []
  const headerIdx = html.search(/Net Unit Price[\s\S]*?Unit FET/i)
  if (headerIdx < 0) return lines
  const after = html.slice(headerIdx)
  const stopMatch = /(?:COUNTY TAX|STATE TAX|LOCAL TAX|TIRE FEE|<\/table>)/i.exec(after)
  const region = stopMatch ? after.slice(0, stopMatch.index) : after
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g
  let m
  while ((m = trRe.exec(region)) !== null) {
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/g
    const cells = []
    let tm
    while ((tm = tdRe.exec(m[1])) !== null) cells.push(clean(tm[1]))
    if (cells.length < 7) continue
    const productCode = cells[1]
    const mspnMatch = productCode.match(/\/\s*([A-Z0-9]+)/i)
    if (!mspnMatch) continue
    const qty = Number(cells[0])
    if (!Number.isFinite(qty) || qty <= 0) continue
    lines.push({
      mspn: mspnMatch[1],
      qty,
      unitPrice: parseMoney(cells[2]),
      discount: Math.abs(parseMoney(cells[3])),
      netUnitPrice: parseMoney(cells[4]),
      unitFet: parseMoney(cells[5]),
      extended: parseMoney(cells[6]),
    })
  }
  return lines
}
