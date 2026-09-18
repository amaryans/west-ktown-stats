export type TeamId = number
export type PlayerId = string

export interface Team {
  id: TeamId
  name: string
  ownerId: string
}

export interface DraftPickInput {
  playerId: PlayerId
  teamId: TeamId
  round: number
  isKeeper: boolean
}

/** Snapshot of the previous season, assembled from Sleeper or built by hand in tests. */
export interface EngineInput {
  teams: Team[]
  draftPicks: DraftPickInput[]
  /** Final rosters including bench, IR, and taxi. */
  finalRosters: Record<TeamId, PlayerId[]>
  /** Players who entered the previous draft as keepers (auto-detected ∪ manual edits). */
  previousKeepers: ReadonlySet<PlayerId>
}

/** League constants from docs/keeper-rules.md rulings R1–R8. */
export interface LeagueRules {
  /** R3: hard cap per team. */
  maxKeepersPerTeam: number
  /** Rule 2.2 rounds in fill order; R2: no slide past the last entry. */
  defaultCostRounds: readonly number[]
  /** Rule 1.2: drafted in rounds 1..N disqualifies. */
  disqualifiedThroughRound: number
}

export const LEAGUE_RULES: LeagueRules = {
  maxKeepersPerTeam: 2,
  defaultCostRounds: [5, 6],
  disqualifiedThroughRound: 4,
}

export type Cost =
  | { kind: 'draft-position'; round: number } // Rule 2.1
  | { kind: 'default' } // Rule 2.2

export type ClaimRule = '3.1.1' | '3.1.2' | '3.2.2' | '3.2.3'

export interface KeeperClaim {
  playerId: PlayerId
  teamId: TeamId
  cost: Cost
  rule: ClaimRule
  /** Set only for 3.2.2: exercisable only if this team does not keep the player. */
  contingentOnDeclineBy?: TeamId
}

export type DisqualificationReason = 'kept-last-season' | 'drafted-rounds-1-4'

export interface Disqualification {
  playerId: PlayerId
  reason: DisqualificationReason
}

export interface EligibilityResult {
  claims: KeeperClaim[]
  disqualified: Disqualification[]
}
