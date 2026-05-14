/**
 * Source of truth for portal brand identity + domain references.
 *
 * Every "Tire Triad" / "Front Range Rubber LLC" / portal domain
 * reference in client code reads from this module so a future
 * rebrand is a one-file change. Mirror server-side at functions/brand.js.
 *
 * Notes on the dual-brand structure (see
 * docs/business/2026-05-02-rebrand-and-gtm-strategy.md):
 *   portal      = Tire Triad      (consumer-facing DBA, portal chrome)
 *   legalEntity = Front Range Rubber LLC (commercial, paperwork)
 */
export const BRAND = Object.freeze({
  portal: 'Tire Triad',
  legalEntity: 'Front Range Rubber LLC',
  apex: 'tiretriad.com',
  portalDomain: 'app.tiretriad.com',
  emailDomain: 'info.tiretriad.com',
  supportEmail: 'info@tiretriad.com',
  inviteUrlBase: 'https://app.tiretriad.com/i',
  legacyApex: 'skedaddleinc.com',
})
