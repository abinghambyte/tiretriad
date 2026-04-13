/**
 * Node-safe formatting for Cloud Functions (mirrors src/utils/format.js).
 * Do not import from src/.
 */

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const INT = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
})

function formatCurrency(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return USD.format(0)
  return USD.format(n)
}

function formatNumber(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0'
  return INT.format(Math.trunc(n))
}

function formatPercent(value, decimals = 1) {
  const n = Number(value)
  if (!Number.isFinite(n)) return `${(0).toFixed(decimals)}%`
  return `${n.toFixed(decimals)}%`
}

function formatQty(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0'
  return INT.format(n)
}

module.exports = {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatQty,
}
