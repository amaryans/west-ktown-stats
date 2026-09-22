/** Formatting shared by the prediction views. */

export function fmtPct(p: number): string {
  if (p >= 0.9995) return '>99.9%'
  if (p > 0 && p < 0.0005) return '<0.1%'
  const pct = p * 100
  return `${pct >= 10 || pct === 0 ? Math.round(pct) : Math.round(pct * 10) / 10}%`
}

export function fmt1(n: number): string {
  return (Math.round(n * 10) / 10).toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

export function fmtRecord(wins: number, losses: number, ties: number): string {
  const w = fmt1(wins)
  const l = fmt1(losses)
  return ties >= 0.05 ? `${w}-${l}-${fmt1(ties)}` : `${w}-${l}`
}

/** Background that fills a cell in proportion to a probability. */
export function pctFill(p: number): string {
  const width = Math.max(0, Math.min(100, p * 100))
  return `linear-gradient(90deg, rgba(56, 189, 248, 0.22) ${width}%, transparent ${width}%)`
}
