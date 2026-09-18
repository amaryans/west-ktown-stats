import type {
  Disqualification,
  EligibilityResult,
  EngineInput,
  KeeperClaim,
  LeagueRules,
  PlayerId,
  TeamId,
} from './types'
import { LEAGUE_RULES } from './types'

/**
 * Applies Rules 1 and 3 of docs/keeper-rules.md to a previous-season snapshot.
 * Pure function; the candidate pool is every player who was drafted or ended
 * the season on a roster. Round assignment (Rule 2.2's 5→6 slide) happens at
 * selection time in assignRounds.
 */
export function computeEligibility(
  input: EngineInput,
  rules: LeagueRules = LEAGUE_RULES,
): EligibilityResult {
  const draftedBy = new Map<PlayerId, { teamId: TeamId; round: number }>()
  for (const pick of input.draftPicks) {
    if (!draftedBy.has(pick.playerId)) {
      draftedBy.set(pick.playerId, { teamId: pick.teamId, round: pick.round })
    }
  }

  const rosteredBy = new Map<PlayerId, TeamId>()
  for (const [teamKey, players] of Object.entries(input.finalRosters)) {
    const teamId = Number(teamKey)
    for (const playerId of players) rosteredBy.set(playerId, teamId)
  }

  const candidates = new Set<PlayerId>([...draftedBy.keys(), ...rosteredBy.keys()])

  const claims: KeeperClaim[] = []
  const disqualified: Disqualification[] = []

  for (const playerId of candidates) {
    // Rule 1.1 first: being kept last season disqualifies regardless of draft round.
    if (input.previousKeepers.has(playerId)) {
      disqualified.push({ playerId, reason: 'kept-last-season' })
      continue
    }
    const drafted = draftedBy.get(playerId)
    if (drafted !== undefined && drafted.round <= rules.disqualifiedThroughRound) {
      disqualified.push({ playerId, reason: 'drafted-rounds-1-4' }) // Rule 1.2
      continue
    }

    const rosterTeam = rosteredBy.get(playerId)
    if (rosterTeam !== undefined) {
      if (drafted !== undefined && drafted.teamId === rosterTeam) {
        // 3.1.1: own draftee kept at draft position (Rule 2.1).
        claims.push({
          playerId,
          teamId: rosterTeam,
          cost: { kind: 'draft-position', round: drafted.round },
          rule: '3.1.1',
        })
      } else {
        // 3.1.2: acquired or undrafted (ruling R1) player at default cost.
        claims.push({ playerId, teamId: rosterTeam, cost: { kind: 'default' }, rule: '3.1.2' })
        if (drafted !== undefined) {
          // 3.2.2: the drafting team's reclaim, contingent on the roster team declining.
          // Ruling R5: applies however the player departed.
          claims.push({
            playerId,
            teamId: drafted.teamId,
            cost: { kind: 'default' },
            rule: '3.2.2',
            contingentOnDeclineBy: rosterTeam,
          })
        }
      }
    } else if (drafted !== undefined) {
      // 3.2.3: drafted player who ended the season a free agent.
      claims.push({ playerId, teamId: drafted.teamId, cost: { kind: 'default' }, rule: '3.2.3' })
    }
  }

  claims.sort(
    (a, b) =>
      a.teamId - b.teamId || a.playerId.localeCompare(b.playerId) || a.rule.localeCompare(b.rule),
  )
  disqualified.sort((a, b) => a.playerId.localeCompare(b.playerId))
  return { claims, disqualified }
}

export function claimsForTeam(result: EligibilityResult, teamId: TeamId): KeeperClaim[] {
  return result.claims.filter((claim) => claim.teamId === teamId)
}
