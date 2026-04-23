import { computeCts } from './ctsCalc'
import { computeMargin } from './marginCalc'
import { tireCatalogBuyNumber } from './tireCatalogBuy'

function csvEscape(value) {
  const s = String(value ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/** Plain decimal for CSV numeric columns (no currency symbol -- import-friendly). */
function csvMoney(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return ''
  return x.toFixed(2)
}

function fmtPosted(ts) {
  if (!ts) return 'Never'
  const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('en-US')
}

/**
 * @param {Array<Record<string, unknown>>} rows Filtered / visible tire rows (enriched ok)
 */
export function exportMarginCsv(rows) {
  const headers = [
    'Brand',
    'Description',
    'MSPN',
    'LR',
    'FB Last Posted',
    'OU Last Posted',
    'CL Last Posted',
    'Buy Price',
    'FET',
    'Mount Cost',
    'Delivery Cost',
    'Other Cost',
    'Overhead Total',
    'Margin %',
  ]
  const lines = [headers.join(',')]

  for (const row of rows) {
    const m = computeMargin(row)
    const marginStr = m != null && !Number.isNaN(m) ? m.toFixed(2) : ''
    const buyPrice = tireCatalogBuyNumber(row)
    const mountCost = Number(row.mountCost) || 0
    const deliveryCost = Number(row.deliveryCost) || 0
    const otherCost = Number(row.otherCost) || 0
    const fet = Number(row.fet) || 0
    const overheadTotal = computeCts(row)

    lines.push(
      [
        csvEscape(row.brand),
        csvEscape(row.description),
        csvEscape(row.mspn),
        csvEscape(row.lr),
        csvEscape(fmtPosted(row.platformListings?.facebook?.lastPostedAt)),
        csvEscape(fmtPosted(row.platformListings?.offerup?.lastPostedAt)),
        csvEscape(fmtPosted(row.platformListings?.craigslist?.lastPostedAt)),
        csvEscape(csvMoney(buyPrice)),
        csvEscape(csvMoney(fet)),
        csvEscape(csvMoney(mountCost)),
        csvEscape(csvMoney(deliveryCost)),
        csvEscape(csvMoney(otherCost)),
        csvEscape(csvMoney(overheadTotal)),
        csvEscape(marginStr),
      ].join(','),
    )
  }

  const blob = new Blob([lines.join('\n')], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `tires-margin-${new Date().toISOString().slice(0, 10)}.csv`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}