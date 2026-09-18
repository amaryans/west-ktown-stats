import type { Cost, KeeperClaim, LeagueRules, PlayerId, TeamId } from './types'
import { LEAGUE_RULES } from './types'

export interface RoundAssignment {
  playerId: PlayerId
  round: number
  cost: Cost
}

export type SelectionConflict =
  | { kind: 'over-max-keepers'; limit: number; selected: number } // R3
  | { kind: 'duplicate-draft-round'; round: number; playerIds: PlayerId[] } // R4 guard
  | { kind: 'no-default-round-available'; playerId: PlayerId; occupiedRounds: number[] } // R2
  | { kind: 'claim-blocked'; playerId: PlayerId; keptBy: TeamId } // 3.2.1 blocks 3.2.2

export interface SelectionResult {
  assignments: RoundAssignment[]
  conflicts: SelectionConflict[]
}

/**
 * Assigns draft rounds to one team's chosen keeper claims.
 *
 * Draft-position keepers occupy their own round first; default-cost keepers
 * then fill rounds 5 and 6 in order (Rule 2.2 — a round occupied by any keeper
 * counts, per fixture E3). Violations are reported as conflicts, never guessed
 * around.
 *
 * @param chosen claims all belonging to a single team
 * @param playersKeptElsewhere players kept by their rostering team, which
 *   blocks that player's contingent 3.2.2 reclaim (fixture E4)
 */
export function assignRounds(
  chosen: KeeperClaim[],
  rules: LeagueRules = LEAGUE_RULES,
  playersKeptElsewhere: ReadonlySet<PlayerId> = new Set(),
): SelectionResult {
  const conflicts: SelectionConflict[] = []
  const assignments: RoundAssignment[] = []

  if (chosen.length > rules.maxKeepersPerTeam) {
    conflicts.push({
      kind: 'over-max-keepers',
      limit: rules.maxKeepersPerTeam,
      selected: chosen.length,
    })
  }

  const active: KeeperClaim[] = []
  for (const claim of chosen) {
    if (claim.contingentOnDeclineBy !== undefined && playersKeptElsewhere.has(claim.playerId)) {
      conflicts.push({
        kind: 'claim-blocked',
        playerId: claim.playerId,
        keptBy: claim.contingentOnDeclineBy,
      })
    } else {
      active.push(claim)
    }
  }

  const occupied = new Set<number>()

  const byRound = new Map<number, KeeperClaim[]>()
  for (const claim of active) {
    if (claim.cost.kind !== 'draft-position') continue
    const group = byRound.get(claim.cost.round) ?? []
    group.push(claim)
    byRound.set(claim.cost.round, group)
  }
  for (const [round, group] of byRound) {
    const first = group[0]
    if (first === undefined) continue
    if (group.length > 1) {
      conflicts.push({
        kind: 'duplicate-draft-round',
        round,
        playerIds: group.map((claim) => claim.playerId),
      })
      continue
    }
    assignments.push({ playerId: first.playerId, round, cost: first.cost })
    occupied.add(round)
  }

  for (const claim of active) {
    if (claim.cost.kind !== 'default') continue
    const round = rules.defaultCostRounds.find((candidate) => !occupied.has(candidate))
    if (round === undefined) {
      conflicts.push({
        kind: 'no-default-round-available',
        playerId: claim.playerId,
        occupiedRounds: [...rules.defaultCostRounds],
      })
      continue
    }
    assignments.push({ playerId: claim.playerId, round, cost: claim.cost })
    occupied.add(round)
  }

  assignments.sort((a, b) => a.round - b.round)
  return { assignments, conflicts }
}
