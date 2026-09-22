/**
 * Turns Sleeper's raw projected stat lines into fantasy points under the
 * league's own scoring settings, so a half-PPR league with 6-point passing
 * touchdowns sees its numbers, not Sleeper's defaults.
 */

export type StatLine = Record<string, number | null | undefined>
export type ScoringSettings = Record<string, number | null | undefined>

/** Points for one stat line under the given scoring. Falls back to Sleeper's totals. */
export function scoreStatLine(stats: StatLine, scoring: ScoringSettings | null): number {
  if (scoring && Object.keys(scoring).length > 0) {
    let total = 0
    let matched = false
    for (const [key, weight] of Object.entries(scoring)) {
      const value = stats[key]
      if (typeof weight !== 'number' || typeof value !== 'number' || !Number.isFinite(value))
        continue
      if (weight === 0) continue
      matched = true
      total += weight * value
    }
    if (matched) return total
  }
  return fallbackPoints(stats, scoring)
}

/** Sleeper's precomputed totals, picked to match the league's reception scoring. */
export function fallbackPoints(stats: StatLine, scoring: ScoringSettings | null): number {
  const rec = Number(scoring?.rec ?? 0)
  const key = rec >= 1 ? 'pts_ppr' : rec > 0 ? 'pts_half_ppr' : 'pts_std'
  const value = stats[key] ?? stats.pts_ppr ?? stats.pts_half_ppr ?? stats.pts_std
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
