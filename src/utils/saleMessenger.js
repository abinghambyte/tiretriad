import { formatCurrency, formatQty } from './format'

/**
 * @param {object} d
 * @param {string} d.mspn
 * @param {number} d.quantity
 * @param {number} d.pricePerTire
 * @param {number} d.totalPrice
 * @param {string} d.customerName
 * @param {string} d.customerContact
 * @param {'Pickup'|'Delivery'} d.fulfillment
 * @param {string} d.fulfillmentNotes
 * @param {string} [d.additionalNotes]
 */
export function formatSaleMessage(d) {
  const notes = [d.fulfillmentNotes, d.additionalNotes]
    .filter(Boolean)
    .join(' | ')

  return [
    '🛞 TIRE SALE - Action Required',
    '',
    `SKU: ${d.mspn}`,
    `Qty: ${formatQty(d.quantity)}`,
    `Price: ${formatCurrency(Number(d.pricePerTire))} each / ${formatCurrency(Number(d.totalPrice))} total`,
    '',
    `Customer: ${d.customerName}`,
    `Contact: ${d.customerContact}`,
    `Fulfillment: ${d.fulfillment}`,
    `Notes: ${notes || '--'}`,
    '',
    'Sent from Skedaddle Portal',
  ].join('\n')
}
