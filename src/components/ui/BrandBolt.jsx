/**
 * Tire Triad brand mark. Three interlocking rings arranged in an
 * equilateral triangle — one ring per "triad" leg (the three operators,
 * the three tire-grade tiers, take your pick). Component name is kept as
 * `BrandBolt` so consumers don't have to chase down imports across the
 * portal; only the glyph itself changed.
 *
 * Renders cleanly from favicon-scale (16px) up to hero-scale (200px+) —
 * single-color, no filters by default, no raster fallback.
 *
 * @param {object} props
 * @param {number} [props.size=20] Pixel size for both width and height.
 * @param {'solid' | 'glow' | 'muted'} [props.tone='solid']
 * @param {string} [props.className]
 * @param {string} [props['aria-label']] If provided, the svg becomes
 *   focusable to assistive tech and aria-hidden is dropped.
 */
export function BrandBolt({
  size = 20,
  tone = 'solid',
  className = '',
  'aria-label': ariaLabel,
  ...rest
}) {
  const labelled = Boolean(ariaLabel)
  const stroke =
    tone === 'muted' ? 'rgba(134, 59, 255, 0.45)' : '#7e14ff'
  const filter =
    tone === 'glow' ? 'drop-shadow(0 0 8px rgba(126, 20, 255, 0.5))' : undefined

  // Three rings on the vertices of an equilateral triangle, side 16,
  // each with radius 9 — overlap of 2 units per pair so the rings
  // genuinely interlock (Olympic-style) rather than just sit near each
  // other. Triangle height = 16 * sqrt(3) / 2 ≈ 13.86; vertical centring
  // in the 48x48 box puts the top vertex at y=16 and the base pair at
  // y≈29.86.
  return (
    <svg
      data-testid="brand-bolt"
      data-tone={tone}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={labelled ? undefined : 'true'}
      aria-label={labelled ? ariaLabel : undefined}
      role={labelled ? 'img' : undefined}
      className={className}
      style={filter ? { filter } : undefined}
      {...rest}
    >
      <circle cx="24" cy="16" r="9" stroke={stroke} strokeWidth="3" />
      <circle cx="16" cy="29.86" r="9" stroke={stroke} strokeWidth="3" />
      <circle cx="32" cy="29.86" r="9" stroke={stroke} strokeWidth="3" />
    </svg>
  )
}
