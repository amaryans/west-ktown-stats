/**
 * Keeper value: how much a keeper claim is worth compared with where the
 * player would go in the upcoming draft. Value is measured in draft picks:
 * a player kept at pick 92 whose ADP is 45 is +47 picks of value.
 * Pure; the UI supplies the claims, names and ADP sources.
 */
import type { KeeperClaim, PlayerId } from './engine/index.ts'
import { LEAGUE_RULES } from './engine/index.ts'
import type { PlayerInfo } from './api/index.ts'

export type AdpSource = 'manual' | 'sleeper-rank' | 'none'

export interface AdpLookup {
  /** Normalized player name -> ADP (overall pick) from a manually entered stat. */
  manualByName: ReadonlyMap<string, number>
  /** Player id -> Sleeper search_rank, used when no manual ADP exists. */
  sleeperRankById: ReadonlyMap<PlayerId, number>
}

export interface KeeperValueRow {
  playerId: PlayerId
  name: string
  position: string | null
  rule: KeeperClaim['rule']
  /** Round the player can be kept in (draft-position cost, or the first default round). */
  keepRound: number
  /** Overall pick that round works out to for this team. */
  keepPick: number
  adp: number | null
  adpSource: AdpSource
  /** ADP minus keep pick: positive means the player goes earlier than you can keep him. */
  valuePicks: number | null
  valueRounds: number | null
  contingentOnTeamId: number | null
}

/** Lower-case, no punctuation or suffixes, so "Ja'Marr Chase Jr." matches "jamarr chase". */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Overall pick for a round, given the team's draft slot (snake order assumed). */
export function pickForRound(round: number, teams: number, slot: number | null): number {
  const s = slot ?? Math.ceil((teams + 1) / 2) // unknown slot: middle of the round
  const position = round % 2 === 1 ? s : teams - s + 1
  return (round - 1) * teams + position
}

export function resolveAdp(
  playerId: PlayerId,
  name: string,
  lookup: AdpLookup,
): { adp: number | null; source: AdpSource } {
  const manual = lookup.manualByName.get(normalizeName(name))
  if (manual !== undefined) return { adp: manual, source: 'manual' }
  const rank = lookup.sleeperRankById.get(playerId)
  if (rank !== undefined && rank > 0 && rank < 10000) return { adp: rank, source: 'sleeper-rank' }
  return { adp: null, source: 'none' }
}

/** One row per claim a team holds, best value first. */
export function keeperValueRows(
  claims: readonly KeeperClaim[],
  playerInfo: Record<PlayerId, PlayerInfo>,
  teams: number,
  slot: number | null,
  lookup: AdpLookup,
): KeeperValueRow[] {
  const defaultRound = LEAGUE_RULES.defaultCostRounds[0] ?? 5
  const rows = claims.map((claim) => {
    const info = playerInfo[claim.playerId]
    const name = info?.name ?? claim.playerId
    const keepRound = claim.cost.kind === 'draft-position' ? claim.cost.round : defaultRound
    const keepPick = pickForRound(keepRound, teams, slot)
    const { adp, source } = resolveAdp(claim.playerId, name, lookup)
    const valuePicks = adp === null ? null : Math.round(keepPick - adp)
    return {
      playerId: claim.playerId,
      name,
      position: info?.position ?? null,
      rule: claim.rule,
      keepRound,
      keepPick,
      adp,
      adpSource: source,
      valuePicks,
      valueRounds: valuePicks === null ? null : Math.round((valuePicks / teams) * 10) / 10,
      contingentOnTeamId: claim.contingentOnDeclineBy ?? null,
    }
  })
  return rows.sort((a, b) => {
    if (a.valuePicks === null && b.valuePicks === null) return a.name.localeCompare(b.name)
    if (a.valuePicks === null) return 1
    if (b.valuePicks === null) return -1
    return b.valuePicks - a.valuePicks
  })
}
