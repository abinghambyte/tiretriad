/**
 * Server-side mirror of src/config/brand.js. Keep in sync. CommonJS so
 * existing Cloud Functions can require() it without an ESM transform.
 */
const BRAND = Object.freeze({
  portal: 'Tire Triad',
  legalEntity: 'Front Range Rubber LLC',
  apex: 'tiretriad.com',
  portalDomain: 'app.tiretriad.com',
  emailDomain: 'info.tiretriad.com',
  supportEmail: 'info@tiretriad.com',
  inviteUrlBase: 'https://app.tiretriad.com/i',
  legacyApex: 'skedaddleinc.com',
})

module.exports = { BRAND }
