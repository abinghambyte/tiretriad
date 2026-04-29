/**
 * Parse a Michelin eFleet HTML report into a map of MSPN → category.
 * Pure function — no Firestore writes here. Wiring lives in the CLI
 * entry point at the bottom of this file (added in Task 3).
 *
 * Run: npm run import:efleet -- path/to/efleet.html
 */

/**
 * @param {string} html
 * @returns {{
 *   mspns: Record<string, 'passenger' | 'lightTruck' | 'truck'>,
 *   account: string | null,
 *   sourceReportDate: string | null,
 *   totalParsed: number,
 * }}
 */
export function parseEfleetCatalog(html) {
  if (!html || typeof html !== 'string' || html.trim() === '') {
    throw new Error('parseEfleetCatalog: empty input')
  }
  const tables = html.match(/<table class="product-table">[\s\S]*?<\/table>/g) || []
  const catBlocks = html.split(/class="cat-section"/)
  if (tables.length === 0 || catBlocks.length < 2) {
    throw new Error('parseEfleetCatalog: malformed input — no product-table or no cat-section blocks found')
  }

  const mspns = {}

  for (let i = 1; i < catBlocks.length; i++) {
    const block = catBlocks[i]
    const titleM = block.match(/class="cat-header-title">([^<]+)/)
    const title = titleM ? titleM[1].trim() : ''
    let cat = null
    if (/light truck/i.test(title)) cat = 'lightTruck'
    else if (/passenger/i.test(title)) cat = 'passenger'
    else if (/^truck\b/i.test(title)) cat = 'truck'
    if (!cat) continue // unknown category title — skip

    const mspnRe = /<td[^>]*style="[^"]*font-family:monospace[^"]*"[^>]*>([0-9]{4,7})<\/td>/g
    let m
    while ((m = mspnRe.exec(block)) !== null) {
      mspns[m[1]] = cat
    }
  }

  if (Object.keys(mspns).length === 0) {
    throw new Error('parseEfleetCatalog: malformed input — no MSPNs extracted (parser regex may need updating for new HTML format)')
  }

  const acctM = html.match(/Ship To: ([^<]+)/)
  const account = acctM ? acctM[1].trim() : null

  const dateM = html.match(/Report Date:<\/td><td>([^<]+)/)
  let sourceReportDate = null
  if (dateM) {
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
    const dm = dateM[1].match(/(\w+)\s+(\d{1,2}),\s+(\d{4})/)
    if (dm) {
      const idx = months.findIndex((mn) => mn.toLowerCase() === dm[1].toLowerCase())
      if (idx >= 0) {
        const mm = String(idx + 1).padStart(2, '0')
        const dd = String(parseInt(dm[2], 10)).padStart(2, '0')
        sourceReportDate = `${dm[3]}-${mm}-${dd}`
      }
    }
  }

  return {
    mspns,
    account,
    sourceReportDate,
    totalParsed: Object.keys(mspns).length,
  }
}

// CLI entry — implemented in Task 3.
