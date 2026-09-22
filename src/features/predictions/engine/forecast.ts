/**
 * A team's weekly score forecast: the optimal lineup's total as the mean,
 * with a spread built from per-player variance. Each starter is modelled as
 * an independent draw whose standard deviation is a fixed share of their
 * projection, which lands a full lineup at roughly ±20–25 points a week.
 */
import { optimalLineup, type LineupInput } from './lineup.ts'
import type { TeamWeekForecast } from './types.ts'

/** Player standard deviation as a share of projected points. */
export const PLAYER_CV = 0.6
/** Floor on a team's weekly spread so byes never make a score "certain". */
export const MIN_TEAM_SD = 8

export function forecastTeamWeek(input: LineupInput, week: number): TeamWeekForecast {
  const lineup = optimalLineup(input)
  const variance = lineup.slots.reduce((sum, s) => sum + (PLAYER_CV * s.points) ** 2, 0)
  return {
    rosterId: input.roster.rosterId,
    week,
    mean: lineup.total,
    sd: Math.max(MIN_TEAM_SD, Math.sqrt(variance)),
    lineup,
  }
}

export function forecastKey(rosterId: number, week: number): string {
  return `${rosterId}:${week}`
}
