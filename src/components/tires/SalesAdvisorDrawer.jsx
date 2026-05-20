import { useEffect, useRef, useState } from 'react'
import { ListingCoachTab } from './ListingCoachTab.jsx'

const SUGGESTIONS = [
  "Help me handle 'I can get them cheaper online'. What's the strongest objection-handling line?",
  'Draft a pitch for our highest-margin Michelin sizes that a fleet customer would care about.',
  'Customer wants 4 LR-E commercials for a moving fleet. What should I lead with and why?',
  "What's a good 7-day follow-up message after a quote went cold?",
]

const TAB_SALES = 'sales'
const TAB_LISTING = 'listing'

export function SalesAdvisorDrawer({
  isOpen,
  messages,
  pending,
  onClose,
  onSend,
  listingMessages = [],
  listingPending = false,
  listingAudience = null,
  onListingAudienceChange = () => {},
  onListingSend = () => {},
}) {
  const [tab, setTab] = useState(TAB_SALES)
  const [draft, setDraft] = useState('')
  const taRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return
    if (tab !== TAB_SALES) return
    queueMicrotask(() => taRef.current?.focus())
  }, [isOpen, tab])

  useEffect(() => {
    if (!listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages, pending])

  if (!isOpen) return null

  const trimmed = draft.trim()
  function submit(e) {
    e.preventDefault()
    if (!trimmed || pending) return
    onSend(trimmed)
    setDraft('')
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit(e)
    }
  }

  return (
    <aside
      role="dialog"
      aria-modal="true"
      aria-label="Sales advisor"
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[480px] flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl sm:w-[480px]"
    >
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Sales advisor</h2>
          <p className="text-[11px] text-zinc-500">Tires page · Claude</p>
        </div>
        <button
          type="button"
          aria-label="Close advisor"
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
        >
          <span aria-hidden className="text-lg">✕</span>
        </button>
      </header>

      <div role="tablist" className="flex border-b border-zinc-800">
        <button
          type="button"
          role="tab"
          data-testid="tab-sales"
          aria-selected={tab === TAB_SALES}
          onClick={() => setTab(TAB_SALES)}
          className={`flex-1 px-3 py-2 text-sm ${tab === TAB_SALES ? 'border-b-2 border-amber-500 text-amber-100' : 'text-zinc-400 hover:text-zinc-200'}`}
        >
          Sales Coach
        </button>
        <button
          type="button"
          role="tab"
          data-testid="tab-listing"
          aria-selected={tab === TAB_LISTING}
          onClick={() => setTab(TAB_LISTING)}
          className={`flex-1 px-3 py-2 text-sm ${tab === TAB_LISTING ? 'border-b-2 border-amber-500 text-amber-100' : 'text-zinc-400 hover:text-zinc-200'}`}
        >
          Listing Coach
        </button>
      </div>

      {tab === TAB_SALES ? (
        <>
          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3">
            {messages.length === 0 ? (
              <div>
                <p className="mb-3 text-sm text-zinc-300">
                  Ask me about quotes, objection handling, high-margin moves, or follow-ups.
                </p>
                <div className="grid gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      data-suggestion
                      onClick={() => setDraft(s)}
                      className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-left text-xs text-zinc-300 transition-colors hover:border-amber-600/40 hover:text-zinc-100"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {messages.map((m, i) => (
                  <li
                    key={i}
                    data-role={m.role}
                    data-error={m.error ? 'true' : 'false'}
                    className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                      m.role === 'user'
                        ? 'self-end bg-amber-700/30 text-amber-100'
                        : m.error
                          ? 'self-start border border-red-700 bg-red-950/40 text-red-200'
                          : 'self-start bg-zinc-900 text-zinc-100'
                    }`}
                  >
                    {m.content}
                  </li>
                ))}
                {pending ? (
                  <li className="self-start rounded-2xl bg-zinc-900 px-3 py-2 text-sm text-zinc-400">Thinking…</li>
                ) : null}
              </ul>
            )}
          </div>

          <form onSubmit={submit} className="border-t border-zinc-800 p-3">
            <textarea
              ref={taRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about quotes, pitches, follow-ups…"
              rows={3}
              className="block w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-600/40 focus:outline-none"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[10px] text-zinc-600">Enter to send · Shift+Enter for newline</span>
              <button
                type="submit"
                disabled={!trimmed || pending}
                className="inline-flex items-center rounded-lg border border-zinc-600 px-3 py-1.5 text-sm font-medium text-zinc-100 hover:border-amber-600/40 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </form>
        </>
      ) : (
        <ListingCoachTab
          messages={listingMessages}
          pending={listingPending}
          audience={listingAudience}
          onAudienceChange={onListingAudienceChange}
          onSend={onListingSend}
        />
      )}
    </aside>
  )
}
