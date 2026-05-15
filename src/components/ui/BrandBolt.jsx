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

  // Equilateral triangle of three rings. Centers chosen so the rings
  // touch tangentially at the midpoints of each triangle edge: with
  // ring radius r=10 the side length is 2r=20, giving vertex centers
  // at (24,15), (14.34,31.73), (33.66,31.73) inside a 48x48 box.
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
      <circle cx="24" cy="15" r="9" stroke={stroke} strokeWidth="3" />
      <circle cx="14.34" cy="31.73" r="9" stroke={stroke} strokeWidth="3" />
      <circle cx="33.66" cy="31.73" r="9" stroke={stroke} strokeWidth="3" />
    </svg>
  )
}
