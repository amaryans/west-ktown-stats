/**
 * Everything the shell needs about the league's current Sleeper season in one
 * call: league info, the teams (user + roster joined), and the current NFL week.
 */
import { sleeper, userAvatarUrl, type SleeperClient } from './client.ts'
import type { SleeperLeague, SleeperRoster, SleeperState, SleeperUser } from './types.ts'

export interface SleeperTeam {
  rosterId: number
  userId: string | null
  displayName: string
  teamName: string | null
  avatarUrl: string | null
  wins: number
  losses: number
  ties: number
  pointsFor: number
  pointsAgainst: number
  starters: string[]
  players: string[]
  reserve: string[]
  taxi: string[]
}

export interface SleeperLeagueInfo {
  leagueId: string
  name: string
  season: number
  status: string
  avatarUrl: string | null
  previousLeagueId: string | null
  /** Sleeper's `week` is the current NFL week; during preseason it is still 1. */
  currentWeek: number
  seasonType: SleeperState['season_type']
  playoffWeekStart: number | null
  medianEnabled: boolean
  teams: SleeperTeam[]
  raw: {
    league: SleeperLeague
    users: SleeperUser[]
    rosters: SleeperRoster[]
    state: SleeperState
  }
}

export function joinTeams(rosters: SleeperRoster[], users: SleeperUser[]): SleeperTeam[] {
  const userById = new Map(users.map((u) => [u.user_id, u]))
  return rosters
    .map((r) => {
      const u = r.owner_id ? userById.get(r.owner_id) : undefined
      const s = r.settings
      return {
        rosterId: r.roster_id,
        userId: r.owner_id,
        displayName: u?.display_name ?? `Roster ${r.roster_id}`,
        teamName: u?.metadata?.team_name ?? null,
        avatarUrl: userAvatarUrl(u),
        wins: s?.wins ?? 0,
        losses: s?.losses ?? 0,
        ties: s?.ties ?? 0,
        pointsFor: (s?.fpts ?? 0) + (s?.fpts_decimal ?? 0) / 100,
        pointsAgainst: (s?.fpts_against ?? 0) + (s?.fpts_against_decimal ?? 0) / 100,
        starters: (r.starters ?? []).filter((p) => p && p !== '0'),
        players: r.players ?? [],
        reserve: r.reserve ?? [],
        taxi: r.taxi ?? [],
      }
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
}

export async function loadSleeperLeague(
  leagueId: string,
  client: SleeperClient = sleeper,
): Promise<SleeperLeagueInfo> {
  const [state, league, users, rosters] = await Promise.all([
    client.getState(),
    client.getLeague(leagueId),
    client.getUsers(leagueId),
    client.getRosters(leagueId),
  ])
  return {
    leagueId,
    name: league.name,
    season: Number(league.season),
    status: league.status,
    avatarUrl: league.avatar ? `https://sleepercdn.com/avatars/thumbs/${league.avatar}` : null,
    previousLeagueId: league.previous_league_id,
    currentWeek:
      state.season_type === 'regular' || state.season_type === 'post' ? Number(state.week) : 1,
    seasonType: state.season_type,
    playoffWeekStart: Number(league.settings?.playoff_week_start) || null,
    medianEnabled: Number(league.settings?.league_average_match) === 1,
    teams: joinTeams(rosters, users),
    raw: { league, users, rosters, state },
  }
}

export function teamLabel(team: Pick<SleeperTeam, 'displayName' | 'teamName'>): string {
  return team.teamName ? `${team.displayName} · ${team.teamName}` : team.displayName
}

export interface LowScorer extends SleeperTeam {
  points: number
  week: number
}

/**
 * Lowest-scoring roster for a fantasy week. Returns null if the week has no
 * scores yet (all zeros), which is what Sleeper reports before games kick off.
 */
export async function lowestScorer(
  leagueId: string,
  week: number,
  teams: SleeperTeam[],
  client: SleeperClient = sleeper,
): Promise<LowScorer | null> {
  if (!week || week < 1) return null
  const matchups = await client.getMatchups(leagueId, week)
  const scored = matchups.filter((m) => m.points !== null && m.points !== undefined)
  if (!scored.length || scored.every((m) => Number(m.points) === 0)) return null
  const teamByRoster = new Map(teams.map((t) => [t.rosterId, t]))
  let low: LowScorer | null = null
  for (const m of scored) {
    const team = teamByRoster.get(m.roster_id)
    if (!team?.userId) continue
    if (!low || Number(m.points) < low.points) low = { ...team, points: Number(m.points), week }
  }
  return low
}
