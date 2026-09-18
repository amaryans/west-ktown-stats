export const MIN_TEAMS = 2
export const MAX_TEAMS = 16

const BPS_TOTAL = 10000

/**
 * The NBA draft lottery odds table (since 2019), in basis points, for 14 teams.
 * Index 0 is the worst team (seed 1). Sums to exactly 10000.
 */
export const NBA_ODDS_BPS: readonly number[] = [
  1400, 1400, 1400, 1250, 1050, 900, 750, 600, 450, 300, 200, 150, 100, 50,
]

/**
 * Tail extensions for 15- and 16-team leagues, continuing the table's
 * roughly x0.66 decay (50 -> 30 -> 20) before renormalization.
 */
const EXTENDED_TAIL_BPS: readonly number[] = [30, 20]

/**
 * Adapt the NBA odds table to a league of `teamCount` teams.
 *
 * - teamCount <= 14: take the first `teamCount` entries (the near-zero tail that
 *   gets dropped belongs to the best teams, matching the spirit of the table).
 * - teamCount 15-16: extend the tail geometrically first.
 *
 * The result is renormalized to sum to exactly 10000 using largest-remainder
 * rounding, so odds are exact integers and honest to display.
 */
export function oddsForLeagueSize(teamCount: number): number[] {
  if (!Number.isInteger(teamCount) || teamCount < MIN_TEAMS || teamCount > MAX_TEAMS) {
    throw new RangeError(
      `teamCount must be an integer in [${MIN_TEAMS}, ${MAX_TEAMS}], got ${teamCount}`,
    )
  }
  const base =
    teamCount <= NBA_ODDS_BPS.length
      ? NBA_ODDS_BPS.slice(0, teamCount)
      : [...NBA_ODDS_BPS, ...EXTENDED_TAIL_BPS.slice(0, teamCount - NBA_ODDS_BPS.length)]
  return renormalizeToBps(base)
}

/** Scale weights so they sum to exactly BPS_TOTAL, via largest-remainder rounding. */
export function renormalizeToBps(weights: readonly number[]): number[] {
  const total = weights.reduce((sum, w) => sum + w, 0)
  const exact = weights.map((w) => (w * BPS_TOTAL) / total)
  const floored = exact.map(Math.floor)
  const shortfall = BPS_TOTAL - floored.reduce((sum, w) => sum + w, 0)

  // Rank positions by fractional remainder, largest first; ties break toward
  // earlier (worse) seeds so the result is deterministic.
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)

  return floored.map(
    (value, index) =>
      value + (byRemainder.findIndex((entry) => entry.index === index) < shortfall ? 1 : 0),
  )
}
