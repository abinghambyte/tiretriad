/**
 * @param {object} props
 * @param {unknown} props.source
 */
export function LeadSourceBadge({ source }) {
  const s = String(source ?? '').trim()

  if (s === 'sinch_chat') {
    return (
      <span className="inline-flex items-center rounded-full bg-violet-500/15 px-2 py-0.5 text-xs font-medium text-violet-200 ring-1 ring-violet-500/40">
        Sinch chat
      </span>
    )
  }
  if (s === 'phone') {
    return (
      <span className="inline-flex items-center rounded-full bg-zinc-700/40 px-2 py-0.5 text-xs font-medium text-zinc-300">
        Phone
      </span>
    )
  }
  if (s === 'referral') {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-200 ring-1 ring-emerald-500/40">
        Referral
      </span>
    )
  }

  const label = titleCaseSource(s) || 'Unknown'
  return (
    <span className="inline-flex items-center rounded-full bg-zinc-800/50 px-2 py-0.5 text-xs font-medium text-zinc-300 ring-1 ring-zinc-700/60">
      {label}
    </span>
  )
}

function titleCaseSource(raw) {
  return String(raw || '')
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}
