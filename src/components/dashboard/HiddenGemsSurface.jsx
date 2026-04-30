import { useEffect, useId, useRef, useState } from 'react'
import { timeAgo } from '../../utils/timeAgo'
import { useToast } from '../../context/ToastContext.jsx'
import { EmptyState } from '../shared/EmptyState.jsx'
import {
  MODAL_CENTER_BACKDROP,
  MODAL_CENTER_PANEL_WIDE,
} from '../ui/modalChrome.js'

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'

const ALL_PLATFORMS = ['ebay', 'marketplace', 'craigslist']
const PLATFORM_LABELS = {
  ebay: 'eBay',
  marketplace: 'Marketplace',
  craigslist: 'Craigslist',
}

function missingPlatforms(gemPlatforms) {
  const have = new Set(gemPlatforms || [])
  return ALL_PLATFORMS.filter((p) => !have.has(p))
}

function GemRow({ gem, onPost, compact = false }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-[13px] text-zinc-100">{gem.sku}</p>
        <p className="truncate text-[13px] text-zinc-300">{gem.description}</p>
        {!compact ? (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {missingPlatforms(gem.platforms).map((p) => (
              <span
                key={p}
                className="rounded-full bg-zinc-800/80 px-2 py-0.5 text-[10px] text-zinc-300"
              >
                {PLATFORM_LABELS[p]}
              </span>
            ))}
            <span className="ml-2 text-[10px] text-zinc-400">
              {gem.lastPostedAt ? timeAgo(gem.lastPostedAt) : 'never'}
            </span>
          </div>
        ) : null}
      </div>
      {onPost ? (
        <button
          type="button"
          onClick={() => onPost(gem.id)}
          className="shrink-0 rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/30"
        >
          Post it
        </button>
      ) : null}
    </div>
  )
}

function GemsModal({ gems, onPost, onClose }) {
  const { toast } = useToast()
  const [selected, setSelected] = useState(() => new Set())
  const [posting, setPosting] = useState(false)
  const headingId = useId()
  const dialogRef = useRef(null)
  const previousFocusRef = useRef(null)

  useEffect(() => {
    previousFocusRef.current = document.activeElement
    const dialog = dialogRef.current
    const firstFocusable = dialog?.querySelector(FOCUSABLE_SELECTOR)
    firstFocusable?.focus()

    function onKey(e) {
      if (e.key === 'Escape' && !posting) {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !dialog) return
      const focusables = dialog.querySelectorAll(FOCUSABLE_SELECTOR)
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previousFocusRef.current?.focus?.()
    }
  }, [onClose, posting])

  function toggleGem(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function postSelected() {
    if (selected.size === 0 || posting) return
    setPosting(true)
    const ids = Array.from(selected)
    try {
      const results = await Promise.allSettled(
        ids.map((id) => {
          try {
            return Promise.resolve(onPost?.(id))
          } catch (err) {
            return Promise.reject(err)
          }
        })
      )
      const failed = results.filter((r) => r.status === 'rejected').length
      if (failed > 0) {
        toast(`${ids.length - failed} posted, ${failed} failed`, 'error')
      } else {
        toast(`${ids.length} posted`, 'success')
      }
      onClose()
    } finally {
      setPosting(false)
    }
  }

  return (
    <div
      className={MODAL_CENTER_BACKDROP}
      onClick={() => {
        if (!posting) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className={MODAL_CENTER_PANEL_WIDE}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <h2 id={headingId} className="text-sm font-semibold text-zinc-100">
            Hidden Gems ({gems.length})
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
          >
            ✕
          </button>
        </div>

        <ul className="max-h-[60vh] divide-y divide-zinc-800/80 overflow-y-auto px-4">
          {gems.map((gem) => (
            <li key={gem.id} className="flex items-start gap-3 py-3">
              <input
                type="checkbox"
                checked={selected.has(gem.id)}
                onChange={() => toggleGem(gem.id)}
                aria-label={`Select ${gem.sku}`}
                className="mt-0.5 size-4 shrink-0 rounded border-zinc-600 accent-amber-400"
              />
              <div className="min-w-0 flex-1">
                <GemRow gem={gem} />
              </div>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-3">
          <span className="text-xs text-zinc-400">{selected.size} selected</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={posting}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800/60 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={selected.size === 0 || posting}
              onClick={postSelected}
              className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-sm font-semibold text-amber-200 hover:bg-amber-500/30 disabled:opacity-40"
            >
              {posting
                ? `Posting ${selected.size}…`
                : `Post selected (${selected.size})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function HiddenGemsSurface({ gems = [], onPost }) {
  const [modalOpen, setModalOpen] = useState(false)
  const list = Array.isArray(gems) ? gems : []
  const previewCount = Math.min(3, list.length)
  const remainingCount = list.length - previewCount

  return (
    <section className="pc-card rounded-xl bg-zinc-900/60 p-[14px]">
      <h2 className="pc-eyebrow">Hidden Gems</h2>
      {list.length === 0 ? (
        <div className="mt-3">
          <EmptyState variant="compact" title="Nothing hidden. Everything cross-posted." />
        </div>
      ) : (
        <>
          <div className="mt-3 space-y-3">
            {list.slice(0, 3).map((gem) => (
              <GemRow key={gem.id} gem={gem} onPost={onPost} />
            ))}
          </div>
          {list.length > 3 ? (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="mt-3 text-xs font-medium text-amber-300/90 hover:underline"
            >
              Show more ({remainingCount} more)
            </button>
          ) : null}
        </>
      )}

      {modalOpen ? (
        <GemsModal
          gems={list}
          onPost={onPost}
          onClose={() => setModalOpen(false)}
        />
      ) : null}
    </section>
  )
}
