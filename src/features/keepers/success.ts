/**
 * Keeper success: how well each keeper decision worked out, judged three ways.
 *
 *  - Draft value: the pick a keeper cost against where the player was going in
 *    drafts that year (ADP), as pick used minus ADP. Positive means the keeper
 *    cost less than the player's draft price: a bargain on draft day.
 *  - Performance: where the player finished that season, ranked by points among
 *    every player drafted in the league, against the pick they cost. Positive
 *    means he outperformed his price.
 *  - Impact: the share of the team's starting-lineup points the keeper scored
 *    while starting, and how the team's season went.
 *
 * Points are Sleeper's league-scoring points from each week's matchups, so
 * they follow the league's own scoring, and only count while a player was on
 * a roster in this league. The composite keeper score is a percentile against
 * every keeper in the league's history, averaged over the parts that are known.
 * Pure: the loader supplies the data.
 */
import type { SleeperMatchup } from '../../lib/sleeper/types.ts'
import { normalizeName } from './value.ts'

export interface SuccessPick {
  playerId: string
  rosterId: number | null
  round: number
  pickNo: number
  isKeeper: boolean
  name: string | null
  position: string | null
}

export interface SuccessTeam {
  rosterId: number
  ownerId: string | null
  ownerName: string
  teamName: string
  avatarSrc: string | null
  /** Regular-season finish, 1 = best. */
  rank: number | null
  /** Playoff placement, 1 = champion, when the bracket is known. */
  placement: number | null
  wins: number
  losses: number
  ties: number
}

export interface SeasonSuccessInput {
  season: number
  leagueId: string
  complete: boolean
  picks: readonly SuccessPick[]
  /** Players the league recorded as kept in this season's draft (adds to the draft's keeper flags). */
  savedKeeperIds: readonly string[]
  /** Regular-season weeks played -> that week's matchups. */
  matchupsByWeek: Readonly<Record<number, readonly SleeperMatchup[]>>
  teams: readonly SuccessTeam[]
  /** Normalized player name -> ADP for this season's draft. */
  adpByName: ReadonlyMap<string, number>
  /** Fallback names and positions when the draft pick has none. */
  playerInfo?: (playerId: string) => { name: string; position: string | null } | undefined
}

export interface KeeperOutcome {
  season: number
  complete: boolean
  playerId: string
  name: string
  position: string | null
  rosterId: number
  ownerId: string | null
  ownerName: string
  teamName: string
  avatarSrc: string | null
  keepRound: number
  keepPick: number
  adp: number | null
  /** Pick used minus ADP: positive means the keeper cost less than the player goes for in drafts. */
  draftValue: number | null
  /** Points while on this team, regular season. */
  points: number
  weeksRostered: number
  weeksStarted: number
  /** Points scored in weeks the keeper started. */
  starterPoints: number
  /** The team's total score across the regular season. */
  teamPoints: number
  /** starterPoints / teamPoints. */
  impactShare: number | null
  /** Rank by season points among every player drafted that year (1 = best). */
  finishRank: number | null
  /** Rank by season points among drafted players at the same position. */
  positionFinish: number | null
  draftedCount: number
  /** Pick used minus finish rank: positive means he outperformed his price. */
  performance: number | null
  teamRank: number | null
  teamPlacement: number | null
  teamRecord: string
  /** 0-100 percentile composite against every keeper given to `scoreKeepers`. */
  score: number | null
}

export interface ManagerKeeperRecord {
  ownerId: string | null
  ownerName: string
  latestTeamName: string
  avatarSrc: string | null
  keepers: number
  seasons: number
  avgScore: number | null
  avgDraftValue: number | null
  avgPerformance: number | null
  avgImpactShare: number | null
  totalPoints: number
  /** Keepers who finished at or above the pick they cost. */
  hits: number
  best: KeeperOutcome | null
  worst: KeeperOutcome | null
}

function mean(values: readonly (number | null)[]): number | null {
  const known = values.filter((v): v is number => v !== null && Number.isFinite(v))
  if (known.length === 0) return null
  return known.reduce((a, b) => a + b, 0) / known.length
}

function formatRecord(t: SuccessTeam): string {
  return t.ties ? `${t.wins}-${t.losses}-${t.ties}` : `${t.wins}-${t.losses}`
}

/** Points per player across every roster, and per (roster, player), from the season's matchups. */
function tallyPoints(matchupsByWeek: SeasonSuccessInput['matchupsByWeek']) {
  const seasonPoints = new Map<string, number>()
  const byRoster = new Map<
    string,
    { points: number; weeks: number; started: number; starterPoints: number }
  >()
  const teamPoints = new Map<number, number>()
  for (const matchups of Object.values(matchupsByWeek)) {
    for (const m of matchups) {
      const starters = new Set(m.starters ?? [])
      teamPoints.set(m.roster_id, (teamPoints.get(m.roster_id) ?? 0) + (m.points ?? 0))
      for (const [playerId, raw] of Object.entries(m.players_points ?? {})) {
        const pts = Number(raw) || 0
        seasonPoints.set(playerId, (seasonPoints.get(playerId) ?? 0) + pts)
        const key = `${m.roster_id}:${playerId}`
        const line = byRoster.get(key) ?? { points: 0, weeks: 0, started: 0, starterPoints: 0 }
        line.points += pts
        line.weeks += 1
        if (starters.has(playerId)) {
          line.started += 1
          line.starterPoints += pts
        }
        byRoster.set(key, line)
      }
    }
  }
  return { seasonPoints, byRoster, teamPoints }
}

/** Every keeper in one season with its draft, performance and impact numbers (score left null). */
export function seasonOutcomes(input: SeasonSuccessInput): KeeperOutcome[] {
  const { seasonPoints, byRoster, teamPoints } = tallyPoints(input.matchupsByWeek)
  const teamById = new Map(input.teams.map((t) => [t.rosterId, t]))
  const weeksPlayed = Object.keys(input.matchupsByWeek).length

  // Finish ranks among drafted players, overall and by position.
  const drafted = input.picks.filter((p) => p.playerId)
  const byPoints = drafted
    .map((p) => ({ pick: p, pts: seasonPoints.get(p.playerId) ?? 0 }))
    .sort((a, b) => b.pts - a.pts)
  const finishRank = new Map<string, number>()
  const positionFinish = new Map<string, number>()
  const positionCount = new Map<string, number>()
  byPoints.forEach(({ pick }, i) => {
    finishRank.set(pick.playerId, i + 1)
    const pos = pick.position ?? input.playerInfo?.(pick.playerId)?.position ?? '?'
    const n = (positionCount.get(pos) ?? 0) + 1
    positionCount.set(pos, n)
    positionFinish.set(pick.playerId, n)
  })

  const keeperIds = new Set<string>([
    ...input.savedKeeperIds,
    ...input.picks.filter((p) => p.isKeeper).map((p) => p.playerId),
  ])
  const outcomes: KeeperOutcome[] = []
  for (const playerId of keeperIds) {
    const pick = input.picks.find((p) => p.playerId === playerId)
    if (!pick || pick.rosterId === null) continue // kept outside the draft: no price to judge
    const team = teamById.get(pick.rosterId)
    const info = input.playerInfo?.(playerId)
    const name = pick.name || info?.name || playerId
    const position = pick.position ?? info?.position ?? null
    const adp = input.adpByName.get(normalizeName(name)) ?? null
    const line = byRoster.get(`${pick.rosterId}:${playerId}`)
    const total = teamPoints.get(pick.rosterId) ?? 0
    const rank = finishRank.get(playerId) ?? null
    outcomes.push({
      season: input.season,
      complete: input.complete,
      playerId,
      name,
      position,
      rosterId: pick.rosterId,
      ownerId: team?.ownerId ?? null,
      ownerName: team?.ownerName ?? `Roster ${pick.rosterId}`,
      teamName: team?.teamName ?? `Roster ${pick.rosterId}`,
      avatarSrc: team?.avatarSrc ?? null,
      keepRound: pick.round,
      keepPick: pick.pickNo,
      adp,
      draftValue: adp === null ? null : Math.round((pick.pickNo - adp) * 10) / 10,
      points: Math.round((line?.points ?? 0) * 100) / 100,
      weeksRostered: line?.weeks ?? 0,
      weeksStarted: line?.started ?? 0,
      starterPoints: Math.round((line?.starterPoints ?? 0) * 100) / 100,
      teamPoints: Math.round(total * 100) / 100,
      impactShare: total > 0 && weeksPlayed > 0 ? (line?.starterPoints ?? 0) / total : null,
      finishRank: weeksPlayed > 0 ? rank : null,
      positionFinish: weeksPlayed > 0 ? (positionFinish.get(playerId) ?? null) : null,
      draftedCount: drafted.length,
      performance: weeksPlayed > 0 && rank !== null ? pick.pickNo - rank : null,
      teamRank: team?.rank ?? null,
      teamPlacement: team?.placement ?? null,
      teamRecord: team ? formatRecord(team) : '',
      score: null,
    })
  }
  return outcomes.sort((a, b) => a.keepPick - b.keepPick)
}

/** Percentile (0-1) of each value among the known values; ties share the average rank. */
function percentiles(values: readonly (number | null)[]): (number | null)[] {
  const known = values
    .map((v, i) => ({ v, i }))
    .filter((x): x is { v: number; i: number } => x.v !== null && Number.isFinite(x.v))
  if (known.length < 2) return values.map((v) => (v === null ? null : 0.5))
  const sorted = known.slice().sort((a, b) => a.v - b.v)
  const out: (number | null)[] = values.map(() => null)
  let i = 0
  while (i < sorted.length) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1]!.v === sorted[i]!.v) j++
    const pct = (i + j) / 2 / (sorted.length - 1)
    for (let k = i; k <= j; k++) out[sorted[k]!.i] = pct
    i = j + 1
  }
  return out
}

/**
 * Fills in `score`: the mean percentile of draft value, performance and impact
 * share across every outcome given, scaled to 0-100. Parts that are unknown
 * (no ADP that year, no weeks played yet) are left out of that keeper's mean.
 */
export function scoreKeepers(outcomes: readonly KeeperOutcome[]): KeeperOutcome[] {
  const draft = percentiles(outcomes.map((o) => o.draftValue))
  const perf = percentiles(outcomes.map((o) => o.performance))
  const impact = percentiles(outcomes.map((o) => o.impactShare))
  return outcomes.map((o, i) => {
    const parts = mean([draft[i] ?? null, perf[i] ?? null, impact[i] ?? null])
    return { ...o, score: parts === null ? null : Math.round(parts * 100) }
  })
}

/** Manager leaderboard: who keeps best, across every season. Best average score first. */
export function managerRecords(outcomes: readonly KeeperOutcome[]): ManagerKeeperRecord[] {
  const groups = new Map<string, KeeperOutcome[]>()
  for (const o of outcomes) {
    const key = o.ownerId ?? `roster:${o.rosterId}`
    groups.set(key, [...(groups.get(key) ?? []), o])
  }
  const records: ManagerKeeperRecord[] = []
  for (const list of groups.values()) {
    const latest = list.reduce((a, b) => (b.season > a.season ? b : a))
    const scored = list.filter((o) => o.score !== null)
    const best = scored.length
      ? scored.reduce((a, b) => ((b.score ?? 0) > (a.score ?? 0) ? b : a))
      : null
    const worst = scored.length
      ? scored.reduce((a, b) => ((b.score ?? 0) < (a.score ?? 0) ? b : a))
      : null
    records.push({
      ownerId: latest.ownerId,
      ownerName: latest.ownerName,
      latestTeamName: latest.teamName,
      avatarSrc: latest.avatarSrc,
      keepers: list.length,
      seasons: new Set(list.map((o) => o.season)).size,
      avgScore: mean(list.map((o) => o.score)),
      avgDraftValue: mean(list.map((o) => o.draftValue)),
      avgPerformance: mean(list.map((o) => o.performance)),
      avgImpactShare: mean(list.map((o) => o.impactShare)),
      totalPoints: list.reduce((sum, o) => sum + o.points, 0),
      hits: list.filter((o) => o.performance !== null && o.performance >= 0).length,
      best,
      worst,
    })
  }
  return records.sort((a, b) => (b.avgScore ?? -1) - (a.avgScore ?? -1) || b.keepers - a.keepers)
}
