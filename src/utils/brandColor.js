/**
 * Tire brand → CSS variable mapping for the catalog visual refresh.
 *
 * Adding a new brand:
 *   1. Add a new --color-brand-<name> token in src/index.css under @theme
 *   2. Add the uppercase brand string here mapping to the new token name
 *
 * Unknown brands fall back to --color-brand-default so rows still render
 * with a visual accent (just neutral) rather than no border.
 */

const BRAND_TOKEN_MAP = {
  BFGOODRICH: 'brand-bfg',
  BFG: 'brand-bfg',
  MICHELIN: 'brand-michelin',
  UNIROYAL: 'brand-uniroyal',
}

/**
 * Returns the bare token name (without leading -- prefix) for use in
 * Tailwind arbitrary value syntax: `border-l-[color:var(--color-brand-bfg)]`.
 *
 * @param {string} brand
 * @returns {string} e.g. 'brand-bfg', 'brand-michelin', 'brand-default'
 */
export function brandColorToken(brand) {
  const key = String(brand || '').trim().toUpperCase()
  return BRAND_TOKEN_MAP[key] || 'brand-default'
}

/**
 * Returns the full CSS color value for a brand, suitable for inline style
 * `borderLeftColor` or similar. Resolves the token at call time so it
 * always matches the current theme.
 *
 * @param {string} brand
 * @returns {string} CSS `var(--color-brand-bfg)` reference
 */
export function brandColorCssVar(brand) {
  return `var(--color-${brandColorToken(brand)})`
}
