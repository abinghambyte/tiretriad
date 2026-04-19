/**
 * Three shared button styles used across order cards, CRM pipeline cards,
 * and other list action rows. Keep to three roles so action hierarchy
 * stays readable: the primary action pops, secondary stays neutral, and
 * destructive reads as a last-resort ghost.
 *
 * primary        — most common positive action; filled amber pill
 * secondary      — supporting positive action; outline neutral
 * ghostDestructive — destructive; ghost red text, border transparent, placed last
 */

export const BTN_PRIMARY =
  'inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50'

export const BTN_SECONDARY =
  'inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-transparent px-3 py-2 text-xs font-semibold text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800/60 disabled:cursor-not-allowed disabled:opacity-50'

export const BTN_GHOST_DESTRUCTIVE =
  'inline-flex items-center gap-1.5 rounded-lg border border-transparent px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50'
