import { marginPercent } from './marginCalc'

function csvEscape(value) {
  const s = String(value ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
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
    'Cost',
    'FET',
    'Mount',
    'Delivery',
    'Other',
    'CTS',
    'Retail',
    'Margin %',
    'Category',
  ]
  const lines = [headers.join(',')]

  for (const row of rows) {
    const m = marginPercent(row.retailPrice ?? row.price, row.cts)
    const marginStr =
      m != null && !Number.isNaN(m) ? m.toFixed(2) : ''
    const cost = Number(row.cost) || 0
    const mountCost = Number(row.mountCost) || 0
    const deliveryCost = Number(row.deliveryCost) || 0
    const otherCost = Number(row.otherCost) || 0
    const fet = Number(row.fet) || 0
    const cts = Number(row.cts) || 0
    const retail = Number(row.retailPrice ?? row.price) || 0

    lines.push(
      [
        csvEscape(row.brand),
        csvEscape(row.description),
        csvEscape(row.mspn),
        csvEscape(row.lr),
        cost.toFixed(2),
        fet.toFixed(2),
        mountCost.toFixed(2),
        deliveryCost.toFixed(2),
        otherCost.toFixed(2),
        cts.toFixed(2),
        retail.toFixed(2),
        marginStr,
        csvEscape(row.category),
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
