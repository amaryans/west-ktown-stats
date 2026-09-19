/**
 * Loads a league's full history from Sleeper: walks previous_league_id back
 * through every season and computes standings for each. Completed seasons
 * are cached in localStorage so repeat visits are instant.
 */
import { mapLimit, sleeper, type SleeperClient } from '../../lib/sleeper/client.ts'
import type { SleeperLeague, SleeperMatchup, SleeperState } from '../../lib/sleeper/types.ts'
import {
  computeSeason,
  regularSeasonWeeks,
  rostersHaveRecords,
  teamsFromRosterSettings,
  type SeasonTeam,
} from './standings.ts'

const CACHE_PREFIX = 'wkt.history:v2:'
const MAX_SEASONS = 30 // safety valve for the previous_league_id chain
const CONCURRENCY = 6

export interface SeasonStandings {
  leagueId: string
  season: string
  name: string
  status: string
  medianEnabled: boolean
  playoffWeekStart: number | null
  weeksPlayed: number[]
  /** roster_id of the bracket winner for completed seasons. */
  champion: number | null
  /** roster_id -> final playoff placement (1 = champion) when the bracket is known. */
  placements: Record<number, number>
  teams: SeasonTeam[]
  complete: boolean
  /**
   * Where the numbers came from: weekly Sleeper matchups (default), the season
   * totals Sleeper keeps on rosters for history added to Sleeper without games
   * ('sleeper-summary'), or standings typed into this site ('manual'). The
   * latter two have no weekly data, so no games vs. median.
   */
  source?: 'sleeper' | 'sleeper-summary' | 'manual'
  /** For manual seasons: the platform the league was on that year. */
  sourceName?: string | null
}

export interface LeagueHistory {
  current: SleeperLeague
  /** Newest season first. */
  seasons: SeasonStandings[]
}

export type ProgressFn = (message: string) => void

function cacheGet(leagueId: string): SeasonStandings | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + leagueId)
    return raw ? (JSON.parse(raw) as SeasonStandings) : null
  } catch {
    return null
  }
}

function cacheSet(leagueId: string, value: SeasonStandings): void {
  try {
    localStorage.setItem(CACHE_PREFIX + leagueId, JSON.stringify(value))
  } catch {
    /* quota or private mode: ignore */
  }
}

export async function loadLeagueChain(
  client: SleeperClient,
  leagueId: string,
  onProgress: ProgressFn,
): Promise<SleeperLeague[]> {
  const leagues: SleeperLeague[] = []
  let id: string | null = leagueId
  const seen = new Set<string>()
  while (id && !seen.has(id) && leagues.length < MAX_SEASONS) {
    seen.add(id)
    onProgress(`Looking up season ${leagues.length + 1}…`)
    let league: SleeperLeague
    try {
      league = await client.getLeague(id)
    } catch (error) {
      if (leagues.length === 0) throw error
      break // a dead previous_league_id; stop the chain gracefully
    }
    leagues.push(league)
    id = league.previous_league_id
  }
  return leagues // newest first
}

export async function loadSeason(
  client: SleeperClient,
  league: SleeperLeague,
  nflState: SleeperState | null,
  onProgress: ProgressFn,
): Promise<SeasonStandings> {
  const cached = cacheGet(league.league_id)
  if (cached && cached.complete && cached.placements) return cached

  const weeks = regularSeasonWeeks(league, nflState)
  const [rosters, users, ...weekly] = await Promise.all([
    client.getRosters(league.league_id),
    client.getUsers(league.league_id),
    ...weeks.map((w) =>
      client.getMatchups(league.league_id, w).catch(() => [] as SleeperMatchup[]),
    ),
  ])
  onProgress(`Loaded ${league.season}`)

  const matchupsByWeek: Record<number, SleeperMatchup[]> = {}
  weeks.forEach((w, i) => (matchupsByWeek[w] = weekly[i] ?? []))

  let champion: number | null = null
  const placements: Record<number, number> = {}
  const seasonIsOver = league.status === 'complete'
  if (seasonIsOver) {
    try {
      const bracket = await client.getWinnersBracket(league.league_id)
      for (const m of bracket) {
        if (m.p === undefined) continue
        if (m.w != null) placements[m.w] = m.p
        if (m.l != null) placements[m.l] = m.p + 1
      }
      const final = bracket.find((m) => m.p === 1)
      if (final && final.w != null) champion = final.w
    } catch {
      /* bracket is a nice-to-have */
    }
  }

  let { teams, weeksPlayed } = computeSeason({ rosters, users, matchupsByWeek })
  // History added to Sleeper from another platform has no matchups, only the
  // season totals on each roster: use those so the season still counts.
  let source: SeasonStandings['source'] = 'sleeper'
  if (weeksPlayed.length === 0 && seasonIsOver && rostersHaveRecords(rosters)) {
    teams = teamsFromRosterSettings(rosters, users)
    weeksPlayed = []
    source = 'sleeper-summary'
  }
  const season: SeasonStandings = {
    leagueId: league.league_id,
    season: String(league.season),
    name: league.name,
    status: league.status,
    medianEnabled: Number(league.settings?.league_average_match) === 1,
    playoffWeekStart: Number(league.settings?.playoff_week_start) || null,
    weeksPlayed,
    champion,
    placements,
    teams,
    complete: seasonIsOver,
    source,
  }
  if (season.complete) cacheSet(league.league_id, season)
  return season
}

export async function loadHistory(
  leagueId: string,
  onProgress: ProgressFn = () => undefined,
  client: SleeperClient = sleeper,
): Promise<LeagueHistory> {
  const [nflState, leagues] = await Promise.all([
    client.getState().catch(() => null),
    loadLeagueChain(client, leagueId, onProgress),
  ])
  const seasons = await mapLimit(leagues, CONCURRENCY, (lg) =>
    loadSeason(client, lg, nflState, onProgress),
  )
  const current = leagues[0]
  if (!current) throw new Error(`No league found with ID "${leagueId}".`)
  // Sleeper notes the previous season's champion on the following league;
  // fill in seasons whose bracket gave nothing (history added without games).
  leagues.forEach((league, i) => {
    const previous = seasons[i + 1]
    const winner = Number(league.metadata?.latest_league_winner_roster_id)
    if (!previous || previous.champion !== null || !previous.complete || !winner) return
    if (!previous.teams.some((t) => t.rosterId === winner)) return
    previous.champion = winner
    previous.placements = { ...previous.placements, [winner]: 1 }
  })
  return { current, seasons: seasons.slice().sort((a, b) => Number(b.season) - Number(a.season)) }
}
