import { useEffect } from 'react'
import { gradePillClass } from '../../utils/ctsCalc.js'
import { TIRE_GRADE_RUBRIC } from '../../utils/tireGradeRubric.js'
import { MODAL_CENTER_BACKDROP, MODAL_CENTER_PANEL } from '../ui/modalChrome.js'

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {{ id: string, mspn?: unknown, description?: unknown, brand?: unknown } | null} props.tire
 * @param {'A' | 'B' | 'C'} props.draftGrade
 * @param {(g: 'A' | 'B' | 'C') => void} props.onDraftChange
 * @param {() => void} props.onClose
 * @param {() => void | Promise<void>} props.onSave
 * @param {boolean} props.saving
 */
export function TireGradeModal({ open, tire, draftGrade, onDraftChange, onClose, onSave, saving }) {
  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !tire) return null

  const mspn = String(tire.mspn || '').trim() || '—'
  const brand = String(tire.brand || '').trim()
  const desc = String(tire.description || '').trim()
  const descShort = desc.length > 140 ? `${desc.slice(0, 140)}…` : desc || '—'

  return (
    <div
      className={`${MODAL_CENTER_BACKDROP} backdrop-blur-sm`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tire-grade-modal-title"
      onClick={onClose}
    >
      <div
        className={`${MODAL_CENTER_PANEL} border-zinc-700 bg-zinc-950 p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="tire-grade-modal-title" className="text-lg font-semibold text-zinc-100">
          Tire grade
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Pick how this row should read in the catalog. Grades are A, B, or C only (scrap stays out of this tool).
        </p>
        <div className="mt-4 rounded-xl border border-zinc-800/90 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-400">
          <div className="font-mono text-sm font-semibold text-zinc-200">{mspn}</div>
          {brand ? <div className="mt-0.5 text-zinc-500">{brand}</div> : null}
          <div className="mt-1 leading-relaxed text-zinc-500">{descShort}</div>
        </div>

        <div
          className="mt-5 max-h-[min(52vh,22rem)] space-y-3 overflow-y-auto overscroll-contain pr-1"
          role="radiogroup"
          aria-label="Grade options"
        >
          {TIRE_GRADE_RUBRIC.map(({ letter, title, detail }) => {
            const selected = draftGrade === letter
            return (
              <button
                key={letter}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onDraftChange(letter)}
                className={`flex w-full gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                  selected
                    ? 'border-amber-500/70 bg-amber-950/25 ring-1 ring-amber-600/40'
                    : 'border-zinc-800 bg-zinc-900/30 hover:border-zinc-600 hover:bg-zinc-900/55'
                }`}
              >
                <span
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${gradePillClass(letter)}`}
                  aria-hidden
                >
                  {letter}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-zinc-100">{title}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-zinc-500">{detail}</span>
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-zinc-800 pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={saving}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : `Save grade ${draftGrade}`}
          </button>
        </div>
      </div>
    </div>
  )
}
