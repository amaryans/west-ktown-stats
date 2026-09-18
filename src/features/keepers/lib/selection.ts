import { assignRounds, claimsForTeam, LEAGUE_RULES } from '../engine'
import type {
  EligibilityResult,
  KeeperClaim,
  LeagueRules,
  PlayerId,
  SelectionResult,
  TeamId,
} from '../engine'

/** Per-team keeper picks; one claim per player per team, so players suffice as keys. */
export type Selections = Record<TeamId, PlayerId[]>

export function toggleSelection(
  selections: Selections,
  teamId: TeamId,
  playerId: PlayerId,
): Selections {
  const current = selections[teamId] ?? []
  const next = current.includes(playerId)
    ? current.filter((id) => id !== playerId)
    : [...current, playerId]
  return { ...selections, [teamId]: next }
}

export interface TeamSelection extends SelectionResult {
  chosen: KeeperClaim[]
}

/**
 * Resolves one team's current picks to rounds. A contingent 3.2.2 claim is
 * blocked when the rostering team has also selected that player (fixture E4).
 */
export function teamSelectionResult(
  result: EligibilityResult,
  selections: Selections,
  teamId: TeamId,
  rules: LeagueRules = LEAGUE_RULES,
): TeamSelection {
  const selected = new Set(selections[teamId] ?? [])
  const chosen = claimsForTeam(result, teamId).filter((claim) => selected.has(claim.playerId))

  const keptByRosterTeam = new Set<PlayerId>()
  for (const claim of chosen) {
    const blocker = claim.contingentOnDeclineBy
    if (blocker !== undefined && (selections[blocker] ?? []).includes(claim.playerId)) {
      keptByRosterTeam.add(claim.playerId)
    }
  }

  return { ...assignRounds(chosen, rules, keptByRosterTeam), chosen }
}
