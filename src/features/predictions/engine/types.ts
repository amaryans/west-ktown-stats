/**
 * Types shared by the prediction engine. Everything here is plain data so the
 * engine stays pure (no React, no fetch, no clock) and easy to test.
 */

/** A player's projected fantasy points for one week, already in league scoring. */
export type WeekProjections = Record<string, number>

export interface ProjectedPlayer {
  playerId: string
  name: string
  /** Sleeper position codes the player can fill (e.g. ['RB'] or ['WR', 'RB']). */
  positions: string[]
  /** NFL team abbreviation, null for free agents. */
  team: string | null
}

export interface RosterInput {
  rosterId: number
  /** Every rostered player id, including bench, IR and taxi. */
  players: string[]
  /** Players on IR / taxi are not startable. */
  unavailable?: string[]
}

export interface LineupSlot {
  slot: string
  playerId: string | null
  points: number
}

export interface Lineup {
  slots: LineupSlot[]
  /** Rostered players left out, best first. */
  bench: { playerId: string; points: number; onBye: boolean }[]
  /** Sum of the starters' projections. */
  total: number
  /** Starting slots the roster cannot fill this week. */
  emptySlots: number
  /** Rostered players whose NFL team is on bye (0 projected points, not injured). */
  byes: string[]
}

export interface TeamWeekForecast {
  rosterId: number
  week: number
  /** Expected score when starting the optimal lineup. */
  mean: number
  /** Standard deviation of that score. */
  sd: number
  lineup: Lineup
}

export interface RecordInput {
  rosterId: number
  wins: number
  losses: number
  ties: number
  pointsFor: number
}

/** One head-to-head game still to be played. */
export interface ScheduledGame {
  week: number
  home: number
  away: number
}

export interface SimulationInput {
  teams: RecordInput[]
  /** Head-to-head games for every unplayed regular-season week. */
  schedule: ScheduledGame[]
  /** Forecasts keyed `${rosterId}:${week}`; missing entries score their mean as 0. */
  forecasts: Record<string, { mean: number; sd: number }>
  /** Weeks still to be simulated (drives the median game when it is on). */
  weeks: number[]
  playoffTeams: number
  /** Sleeper's "league median" extra game each week. */
  medianGame: boolean
  runs: number
  seed: number
}

export interface TeamOdds {
  rosterId: number
  playoff: number
  bye: number
  /** Probability of each seed, index 0 = seed 1, length = team count. */
  seedDistribution: number[]
  averageSeed: number
  /** Probability of finishing first in the standings. */
  topSeed: number
  projectedWins: number
  projectedLosses: number
  projectedTies: number
  projectedPointsFor: number
}

export interface SimulationResult {
  runs: number
  seed: number
  playoffTeams: number
  byes: number
  teams: TeamOdds[]
}
