import { useState } from 'react'

/**
 * Split a string on triple-backtick fences into alternating
 * { type: 'text' } / { type: 'code' } segments. Trailing text after
 * the last fence is preserved. A string with no fences yields a single
 * text block.
 *
 * @param {string} content
 * @returns {Array<{ type: 'text' | 'code', text: string }>}
 */
function splitIntoBlocks(content) {
  const out = []
  const re = /```([^\n]*)\n([\s\S]*?)```/g
  let lastIdx = 0
  let m
  while ((m = re.exec(content)) !== null) {
    if (m.index > lastIdx) {
      out.push({ type: 'text', text: content.slice(lastIdx, m.index) })
    }
    out.push({ type: 'code', text: m[2].replace(/\n$/, '') })
    lastIdx = re.lastIndex
  }
  if (lastIdx < content.length) {
    out.push({ type: 'text', text: content.slice(lastIdx) })
  }
  if (out.length === 0) out.push({ type: 'text', text: content })
  return out
}

function CodeBlockWithCopy({ text }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Best-effort; clipboard may be unavailable in some contexts.
    }
  }
  return (
    <div className="relative my-2 rounded-lg border border-zinc-800 bg-zinc-950">
      <button
        type="button"
        data-testid="copy-listing"
        onClick={copy}
        className="absolute right-2 top-2 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] font-medium text-zinc-200 hover:border-amber-600/40 hover:text-amber-100"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre className="overflow-auto whitespace-pre-wrap p-3 pr-16 text-xs text-zinc-100">{text}</pre>
    </div>
  )
}

function MessageBlock({ message }) {
  if (message.role === 'user') {
    return (
      <div className="rounded-xl bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
        {message.content}
      </div>
    )
  }
  const blocks = splitIntoBlocks(String(message.content || ''))
  const wrapperClass = message.error
    ? 'rounded-xl border border-red-700/40 bg-red-950/30 px-3 py-2 text-sm text-red-100'
    : 'rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200'
  return (
    <div className={wrapperClass} data-error={message.error ? 'true' : 'false'}>
      {blocks.map((b, i) =>
        b.type === 'code' ? (
          <CodeBlockWithCopy key={i} text={b.text} />
        ) : (
          <p key={i} className="whitespace-pre-wrap">{b.text}</p>
        ),
      )}
    </div>
  )
}

const AUDIENCE_OPTIONS = [
  { value: '', label: 'Auto' },
  { value: 'consumer', label: 'Consumer' },
  { value: 'commercial', label: 'Commercial' },
]

export function ListingCoachTab({ messages, pending, onSend, audience, onAudienceChange }) {
  const [draft, setDraft] = useState('')

  function submit() {
    const t = draft.trim()
    if (!t || pending) return
    onSend(t)
    setDraft('')
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      submit()
    }
  }

  const trimmed = draft.trim()

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Listing Coach</h3>
          <p className="text-[11px] text-zinc-500">Drafts copy and prices for new listings.</p>
        </div>
        <label className="flex items-center gap-2 text-[11px] text-zinc-400">
          <span>Audience</span>
          <select
            data-testid="coach-audience"
            value={audience || ''}
            onChange={(e) => onAudienceChange(e.target.value || null)}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 focus:border-amber-600/40 focus:outline-none"
          >
            {AUDIENCE_OPTIONS.map((o) => (
              <option key={o.label} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <p className="text-xs text-zinc-500">
            Try: &quot;draft a listing for 4 of MSPN 81501&quot; or &quot;what would 8 of XLGD 11R22.5 sell for?&quot;
          </p>
        ) : null}
        {messages.map((m, i) => <MessageBlock key={i} message={m} />)}
        {pending ? <p className="text-xs text-zinc-500">Coach thinking...</p> : null}
      </div>
      <footer className="border-t border-zinc-800 p-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe what you want to list..."
          rows={3}
          className="block w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-600/40 focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] text-zinc-600">Cmd/Ctrl+Enter to send</span>
          <button
            type="button"
            data-testid="coach-send"
            onClick={submit}
            disabled={!trimmed || pending}
            className="inline-flex items-center rounded-lg border border-zinc-600 px-3 py-1.5 text-sm font-medium text-zinc-100 hover:border-amber-600/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </footer>
    </div>
  )
}
