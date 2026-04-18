/**
 * Reusable empty-state card. Matches the VIP kanban empty-state visual in
 * `CrmPage` (dashed border, icon bubble, muted title, optional CTA).
 *
 * Two variants:
 *  - `card` (default): full rounded-2xl card with dashed border. Use outside
 *    of tables (lists, kanbans, standalone blocks).
 *  - `row`: designed to sit inside a `<tbody>` as a single `<tr>` that spans
 *    all columns. Pass `colSpan` matching the table.
 *
 * @param {object} props
 * @param {'card' | 'row'} [props.variant]
 * @param {number} [props.colSpan]
 * @param {React.ReactNode} [props.icon]  24-sized inline SVG; wraps in a muted bubble
 * @param {string} props.title
 * @param {string} [props.description]
 * @param {React.ReactNode} [props.action]  typically a primary button
 */
export function EmptyState({ variant = 'card', colSpan, icon, title, description, action }) {
  const body = (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon ? (
        <div
          className="rounded-full border border-zinc-700/80 bg-zinc-950/80 p-4 text-zinc-500"
          aria-hidden
        >
          {icon}
        </div>
      ) : null}
      <p className={`${icon ? 'mt-5' : ''} text-sm font-medium text-zinc-200`}>{title}</p>
      {description ? (
        <p className="mt-2 max-w-md text-xs leading-relaxed text-zinc-500">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )

  if (variant === 'row') {
    return (
      <tr>
        <td colSpan={colSpan || 1}>{body}</td>
      </tr>
    )
  }

  return (
    <div className="rounded-2xl border border-dashed border-zinc-700/70 bg-zinc-900/25">
      {body}
    </div>
  )
}

export { EmptyStateIcons } from './emptyStateIcons.jsx'
