const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const INT = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
})

/**
 * @param {unknown} value
 * @returns {string}
 */
export function formatCurrency(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return USD.format(0)
  return USD.format(n)
}

/**
 * Currency for display tables -- em dash when missing or non-finite.
 * @param {unknown} value
 * @returns {string}
 */
export function formatCurrencyOrDash(value) {
  if (value == null || value === '') return '--'
  const n = Number(value)
  if (!Number.isFinite(n)) return '--'
  return USD.format(n)
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function formatNumber(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0'
  return INT.format(Math.trunc(n))
}

/**
 * @param {unknown} value
 * @param {number} [decimals=1]
 * @returns {string}
 */
export function formatPercent(value, decimals = 1) {
  const n = Number(value)
  if (!Number.isFinite(n)) return `${(0).toFixed(decimals)}%`
  return `${n.toFixed(decimals)}%`
}

/**
 * Integer quantity (pre-sold / negative allowed). Uses truncation toward zero.
 * @param {unknown} value
 * @returns {string}
 */
export function formatQty(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0'
  return INT.format(Math.trunc(n))
}
