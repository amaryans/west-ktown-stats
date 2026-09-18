import type { OrderingSource, Team } from './types.ts'

/**
 * Order teams worst-first for the lottery (index 0 = seed 1 = best odds).
 * Returns a new array; never mutates the input.
 *
 * - regularSeason: ascending win percentage, then ascending points-for,
 *   then id — fully deterministic even with identical records.
 * - playoffs: teams without a playoff placement are worst (ordered among
 *   themselves by regular season), then placed teams by placement descending,
 *   so the champion is always the final seed.
 */
export function computeLotterySeeds(teams: readonly Team[], source: OrderingSource): Team[] {
  if (source === 'playoffs' && !hasPlayoffResults(teams)) {
    throw new Error('Playoff ordering requires at least one team with a playoff placement')
  }
  const byRegularSeason = [...teams].sort(compareRegularSeasonWorstFirst)
  if (source === 'regularSeason') {
    return byRegularSeason
  }
  const unplaced = byRegularSeason.filter((team) => team.playoffFinish === null)
  const placed = byRegularSeason
    .filter((team) => team.playoffFinish !== null)
    .sort((a, b) => (b.playoffFinish ?? 0) - (a.playoffFinish ?? 0))
  return [...unplaced, ...placed]
}

export function hasPlayoffResults(teams: readonly Team[]): boolean {
  return teams.some((team) => team.playoffFinish !== null)
}

/** True when no games have been played yet (a brand-new season's league). */
export function isPreseason(teams: readonly Team[]): boolean {
  return teams.every((team) => team.wins === 0 && team.losses === 0 && team.ties === 0)
}

function compareRegularSeasonWorstFirst(a: Team, b: Team): number {
  return (
    winPercentage(a) - winPercentage(b) ||
    a.pointsFor - b.pointsFor ||
    a.id.localeCompare(b.id, undefined, { numeric: true })
  )
}

function winPercentage(team: Team): number {
  const games = team.wins + team.losses + team.ties
  if (games === 0) {
    return 0
  }
  return (team.wins + team.ties / 2) / games
}
