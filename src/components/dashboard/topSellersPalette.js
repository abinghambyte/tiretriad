// Paired palette from the dashboard-redesign spec Appendix A.
// Primary paints the big numerals (rank digit + sold count).
// Accent paints the # glyph and the SOLD caption.
export const TOP_SELLERS_PALETTE = [
  { primary: '#fbbf24', accent: '#94a3b8' }, // 1 gold / slate
  { primary: '#e2e8f0', accent: '#fbbf24' }, // 2 silver / gold
  { primary: '#f97316', accent: '#2dd4bf' }, // 3 bronze / teal
  { primary: '#a3e635', accent: '#64748b' }, // 4 lime / slate
  { primary: '#34d399', accent: '#fcd34d' }, // 5 emerald / amber
  { primary: '#22d3ee', accent: '#a78bfa' }, // 6 cyan / violet
  { primary: '#60a5fa', accent: '#fda4af' }, // 7 sky / rose
  { primary: '#a78bfa', accent: '#6ee7b7' }, // 8 violet / mint
  { primary: '#f472b6', accent: '#22d3ee' }, // 9 pink / cyan
  { primary: '#94a3b8', accent: '#fcd34d' }, // 10 slate / amber
]

export function paletteForRank(rank) {
  const n = Number(rank)
  if (!Number.isFinite(n)) return TOP_SELLERS_PALETTE[0]
  const len = TOP_SELLERS_PALETTE.length
  const idx = (((Math.trunc(n) - 1) % len) + len) % len
  return TOP_SELLERS_PALETTE[idx]
}
