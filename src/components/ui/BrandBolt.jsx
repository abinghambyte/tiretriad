/**
 * Brand lightning-bolt glyph. Single source of truth for the Skedaddle
 * mark; consumers pick a size and tone. Path is a simplified flat-purple
 * version of public/favicon.svg (no gaussian blurs — those are expensive
 * in the DOM and would make every empty-state card more costly).
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
  const fill =
    tone === 'muted' ? 'rgba(134, 59, 255, 0.45)' : '#7e14ff'
  const filter =
    tone === 'glow' ? 'drop-shadow(0 0 8px rgba(126, 20, 255, 0.5))' : undefined

  return (
    <svg
      data-testid="brand-bolt"
      data-tone={tone}
      width={size}
      height={size}
      viewBox="0 0 48 46"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={labelled ? undefined : 'true'}
      aria-label={labelled ? ariaLabel : undefined}
      role={labelled ? 'img' : undefined}
      className={className}
      style={filter ? { filter } : undefined}
      {...rest}
    >
      <path
        d="M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578H1.237c-.92 0-1.456-1.04-.92-1.788L10.013.474c.214-.297.556-.474.92-.474h28.894c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.579 1.842 3.579h11.377c.943 0 1.473 1.088.89 1.83L25.947 44.94z"
        fill={fill}
      />
    </svg>
  )
}
