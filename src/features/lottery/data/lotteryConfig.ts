import { computeLotterySeeds, hasPlayoffResults } from './ordering.ts'
import { oddsForLeagueSize } from '../engine/odds.ts'
import { validateFloors } from '../engine/lottery.ts'
import type { LotteryConfig } from '../engine/types.ts'
import type { AppSettings, League, Team } from './types.ts'

const BPS_TOTAL = 10000

/** Teams in lottery-seed order, falling back to regular season when no bracket exists. */
export function seededTeamsFor(league: League, settings: AppSettings): Team[] {
  const source =
    settings.orderingSource === 'playoffs' && !hasPlayoffResults(league.teams)
      ? 'regularSeason'
      : settings.orderingSource
  return computeLotterySeeds(league.teams, source)
}

/** True when the overrides are structurally valid for this league size. */
export function isValidCustomOdds(odds: number[] | null, teamCount: number): odds is number[] {
  return (
    odds !== null &&
    odds.length === teamCount &&
    odds.every((bps) => Number.isInteger(bps) && bps > 0) &&
    odds.reduce((sum, bps) => sum + bps, 0) === BPS_TOTAL
  )
}

/** The odds actually used: valid custom overrides, else the NBA table. */
export function effectiveOddsBps(teamCount: number, settings: AppSettings): number[] {
  const custom = settings.customOddsBps ?? null
  return isValidCustomOdds(custom, teamCount) ? custom : oddsForLeagueSize(teamCount)
}

/** The floors actually used, or undefined when absent/invalid/all-null. */
export function effectiveFloors(
  teamCount: number,
  settings: AppSettings,
): (number | null)[] | undefined {
  const floors = settings.pickFloors ?? null
  if (
    floors !== null &&
    floors.length === teamCount &&
    floors.some((floor) => floor !== null) &&
    validateFloors(floors, teamCount) === null
  ) {
    return floors
  }
  return undefined
}

/** Assemble the frozen engine config from the league and current settings. */
export function buildLotteryConfig(league: League, settings: AppSettings): LotteryConfig {
  const seeded = seededTeamsFor(league, settings)
  return {
    teams: seeded.map((team, index) => ({ id: team.id, seed: index + 1 })),
    oddsBps: effectiveOddsBps(seeded.length, settings),
    floors: effectiveFloors(seeded.length, settings),
  }
}
