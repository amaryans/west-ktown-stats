/**
 * Gathers everything the season simulation needs from Sleeper for the
 * current season: the standings so far (regular-season weeks that are
 * final), the remaining head-to-head schedule, every roster, and each
 * remaining week's player projections scored under the league's own
 * settings. Projections are cached in IndexedDB for a few hours; Sleeper
 * refreshes them through the week, so the cache stays short.
 */
import { cacheGet, cacheSet } from '../../lib/idbCache.ts'
import { loadPlayers, playerName, type PlayersDump } from '../../lib/players.ts'
import { mapLimit, sleeper, userAvatarUrl, type SleeperClient } from '../../lib/sleeper/client.ts'
import type {
  SleeperBracketMatchup,
  SleeperLeague,
  SleeperMatchup,
  SleeperProjection,
  SleeperRoster,
  SleeperState,
  SleeperUser,
} from '../../lib/sleeper/types.ts'
import { computeSeason, weekWasPlayed, type RecordLine } from '../standings/standings.ts'
import {
  forecastKey,
  forecastTeamWeek,
  inferByeTeams,
  roundWeeks,
  scoreStatLine,
  winnersPath,
  type BracketMatchLike,
  type PlayoffFormat,
  type ProjectedPlayer,
  type ScheduledGame,
  type SimulationInput,
  type TeamWeekForecast,
  type WeekProjections,
} from './engine/index.ts'

export const PROJECTIONS_CACHE_PREFIX = 'projections:v1:'
export const PROJECTIONS_MAX_AGE_MS = 6 * 60 * 60 * 1000
const CONCURRENCY = 6

/** Spread used for a week whose projections could not be loaded. */
const FALLBACK_SD = 25

export interface PredictionTeam {
  rosterId: number
  ownerId: string | null
  ownerName: string
  teamName: string
  avatarSrc: string | null
  /** Record that decides seeding: head-to-head plus the median game when the league plays one. */
  record: RecordLine
  h2h: RecordLine
  pointsFor: number
  players: string[]
  unavailable: string[]
}

export interface WeekMatchup {
  week: number
  home: number
  away: number
}

export interface PredictionData {
  leagueId: string
  leagueName: string
  season: string
  /** Sleeper's current NFL week (1 before the season, past the last week after it). */
  currentWeek: number
  lastRegularWeek: number
  /** Regular-season weeks whose scores are final. */
  playedWeeks: number[]
  /** Weeks the simulation plays out, including one in progress. */
  remainingWeeks: number[]
  /** The current week when it has already started (partial scores are ignored). */
  inProgressWeek: number | null
  playoffTeams: number
  /** Weeks each playoff round is played in (index 0 = round 1). */
  playoffRounds: number[][]
  /** Playoff weeks still to be played, in order. */
  playoffWeeks: number[]
  /** Sleeper reseeds each round (`playoff_seed_type` 1) instead of a fixed bracket. */
  reseed: boolean
  /** Sleeper's bracket once the playoffs have started, null before. */
  bracket: BracketMatchLike[] | null
  medianGame: boolean
  divisions: number
  rosterPositions: string[]
  scoringKnown: boolean
  teams: PredictionTeam[]
  schedule: ScheduledGame[]
  /** Keyed by forecastKey(rosterId, week); every team has one per remaining week. */
  forecasts: Record<string, TeamWeekForecast>
  players: Record<string, ProjectedPlayer>
  /** Remaining weeks whose projections Sleeper did not provide. */
  missingProjectionWeeks: number[]
  /** NFL teams on bye per remaining week, inferred from the projections. */
  byeTeamsByWeek: Record<number, string[]>
  /** When the underlying data was fetched. */
  loadedAt: number
}

export type ProgressFn = (message: string) => void

function num(x: unknown): number {
  const n = Number(x)
  return Number.isFinite(n) ? n : 0
}

/** Last regular-season week from the league settings, with the NFL length as fallback. */
export function lastRegularSeasonWeek(league: Pick<SleeperLeague, 'season' | 'settings'>): number {
  const last = num(league.settings?.playoff_week_start) - 1
  if (last > 0) return last
  return num(league.season) >= 2021 ? 18 : 17
}

/**
 * The NFL week in the league's season as Sleeper sees it: 1 before kickoff,
 * one past the last regular-season week once the playoffs (or off-season) begin.
 */
export function currentWeekFor(
  league: Pick<SleeperLeague, 'season'>,
  state: Pick<SleeperState, 'season' | 'season_type' | 'week'> | null,
  lastRegularWeek: number,
): number {
  if (!state || String(state.season) !== String(league.season)) {
    // A different season on Sleeper's clock: this league is either over or not started.
    return state && num(state.season) > num(league.season) ? lastRegularWeek + 1 : 1
  }
  if (state.season_type === 'pre') return 1
  if (state.season_type === 'regular') return Math.max(1, num(state.week))
  return lastRegularWeek + 1
}

/** Last week of the NFL regular season Sleeper can score. */
export const LAST_NFL_WEEK = 18

/**
 * Weeks per playoff round. Sleeper's `playoff_round_type` is undocumented, so
 * a reading that would push the final past the NFL calendar falls back to
 * one week per round, which is what fits (e.g. six teams over weeks 15–17).
 */
export function playoffRoundWeeks(
  playoffTeams: number,
  firstWeek: number,
  roundType: number,
): number[][] {
  const rounds = roundWeeks(playoffTeams, firstWeek, roundType, LAST_NFL_WEEK)
  if (rounds.every((r) => r.length > 0)) return rounds
  return roundWeeks(playoffTeams, firstWeek, 0, LAST_NFL_WEEK)
}

/** Head-to-head pairings from a week's matchups (byes and malformed pairs skipped). */
export function pairingsFor(week: number, matchups: readonly SleeperMatchup[]): ScheduledGame[] {
  const sides = new Map<number, number[]>()
  for (const m of matchups) {
    if (m.matchup_id == null) continue
    if (!sides.has(m.matchup_id)) sides.set(m.matchup_id, [])
    sides.get(m.matchup_id)?.push(m.roster_id)
  }
  const games: ScheduledGame[] = []
  for (const pair of sides.values()) {
    if (pair.length !== 2) continue
    games.push({ week, home: pair[0] as number, away: pair[1] as number })
  }
  return games.sort((a, b) => a.home - b.home)
}

/** Rostered players as the engine sees them, from the players dump. */
export function projectedPlayers(
  rosters: readonly SleeperRoster[],
  dump: PlayersDump,
): Record<string, ProjectedPlayer> {
  const out: Record<string, ProjectedPlayer> = {}
  for (const r of rosters) {
    for (const id of r.players ?? []) {
      const p = dump[id]
      const positions = (p?.fantasy_positions ?? []).filter(Boolean)
      if (positions.length === 0 && p?.position) positions.push(p.position)
      out[id] = {
        playerId: id,
        name: playerName(p, id),
        positions,
        team: p?.team ?? null,
      }
    }
  }
  return out
}

/** League-scored projected points per player for one week. */
export function scoreProjections(
  rows: readonly SleeperProjection[],
  scoring: SleeperLeague['scoring_settings'],
): WeekProjections {
  const out: WeekProjections = {}
  for (const row of rows) {
    const pts = scoreStatLine(row.stats, scoring ?? null)
    if (pts > 0) out[row.player_id] = Math.round(pts * 100) / 100
  }
  return out
}

async function loadWeekProjections(
  client: SleeperClient,
  season: string,
  week: number,
): Promise<SleeperProjection[] | null> {
  const key = `${PROJECTIONS_CACHE_PREFIX}${season}:${week}`
  const cached = await cacheGet<SleeperProjection[]>(key, PROJECTIONS_MAX_AGE_MS)
  if (cached !== undefined) return cached
  try {
    const rows = await client.getProjections(season, week)
    // Keep only the stat keys the app reads, so the cache stays small.
    const compact = rows.map((r) => ({
      player_id: r.player_id,
      stats: r.stats,
      team: r.team ?? null,
      opponent: r.opponent ?? null,
    }))
    if (compact.length > 0) void cacheSet(key, compact)
    return compact
  } catch {
    return null
  }
}

/**
 * NFL teams that appear in any week's projections, i.e. the teams whose
 * players Sleeper projects; a team missing from a given week is on bye.
 */
function activeTeams(
  weeks: readonly { projections: WeekProjections }[],
  dump: PlayersDump,
): Set<string> {
  const teams = new Set<string>()
  for (const { projections } of weeks) {
    for (const id of Object.keys(projections)) {
      const team = dump[id]?.team
      if (team) teams.add(team)
    }
  }
  return teams
}

export async function loadPredictionData(
  leagueId: string,
  onProgress: ProgressFn = () => undefined,
  client: SleeperClient = sleeper,
): Promise<PredictionData> {
  onProgress('Loading the league from Sleeper…')
  const [state, league, users, rosters] = await Promise.all([
    client.getState().catch(() => null),
    client.getLeague(leagueId),
    client.getUsers(leagueId),
    client.getRosters(leagueId),
  ])
  const lastRegularWeek = lastRegularSeasonWeek(league)
  const currentWeek = currentWeekFor(league, state, lastRegularWeek)
  const allWeeks = Array.from({ length: lastRegularWeek }, (_, i) => i + 1)

  onProgress('Loading the schedule…')
  const weekly = await mapLimit(allWeeks, CONCURRENCY, (w) =>
    client.getMatchups(leagueId, w).catch(() => [] as SleeperMatchup[]),
  )
  const matchupsByWeek: Record<number, SleeperMatchup[]> = {}
  allWeeks.forEach((w, i) => (matchupsByWeek[w] = weekly[i] ?? []))

  const playedWeeks = allWeeks.filter((w) => w < currentWeek && weekWasPlayed(matchupsByWeek[w]))
  const remainingWeeks = allWeeks.filter((w) => !playedWeeks.includes(w))
  const inProgressWeek =
    currentWeek <= lastRegularWeek && weekWasPlayed(matchupsByWeek[currentWeek])
      ? currentWeek
      : null

  const playoffTeams = num(league.settings?.playoff_teams) || Math.min(6, rosters.length)
  const playoffRounds = playoffRoundWeeks(
    playoffTeams,
    lastRegularWeek + 1,
    num(league.settings?.playoff_round_type),
  )
  const playoffWeeks = playoffRounds.flat().filter((w) => w >= currentWeek)
  const playoffsStarted = currentWeek > lastRegularWeek
  const bracket = playoffsStarted
    ? await client
        .getWinnersBracket(leagueId)
        .then((rows) => rows.map(bracketMatch))
        .catch(() => null)
    : null

  const playedMatchups: Record<number, SleeperMatchup[]> = {}
  for (const w of playedWeeks) playedMatchups[w] = matchupsByWeek[w] ?? []
  const { teams: standings } = computeSeason({ rosters, users, matchupsByWeek: playedMatchups })
  const medianGame = num(league.settings?.league_average_match) === 1

  const schedule = remainingWeeks.flatMap((w) => pairingsFor(w, matchupsByWeek[w] ?? []))

  onProgress('Loading players and projections…')
  const forecastWeeks = [...remainingWeeks, ...playoffWeeks]
  const [dump, ...projectionRows] = await Promise.all([
    loadPlayers(client),
    ...forecastWeeks.map((w) => loadWeekProjections(client, league.season, w)),
  ])
  const players = projectedPlayers(rosters, dump)
  const weeks = forecastWeeks.map((week, i) => {
    const rows = projectionRows[i]
    return {
      week,
      available: rows !== null && rows !== undefined && rows.length > 0,
      projections: scoreProjections(rows ?? [], league.scoring_settings ?? null),
    }
  })
  const nflTeams = activeTeams(weeks, dump)
  const rosterPositions = league.roster_positions ?? []
  const usersById = new Map<string, SleeperUser>(users.map((u) => [u.user_id, u]))

  const teams: PredictionTeam[] = rosters.map((r) => {
    const s = standings.find((t) => t.rosterId === r.roster_id)
    const owner = r.owner_id ? usersById.get(r.owner_id) : undefined
    const h2h = s?.h2h ?? { wins: 0, losses: 0, ties: 0 }
    return {
      rosterId: r.roster_id,
      ownerId: r.owner_id,
      ownerName: s?.ownerName ?? owner?.display_name ?? `Roster ${r.roster_id}`,
      teamName: s?.teamName ?? owner?.metadata?.team_name ?? `Roster ${r.roster_id}`,
      avatarSrc: userAvatarUrl(owner),
      record: medianGame ? (s?.combined ?? h2h) : h2h,
      h2h,
      pointsFor: s?.pointsFor ?? 0,
      players: (r.players ?? []).filter(Boolean),
      unavailable: [...(r.reserve ?? []), ...(r.taxi ?? [])],
    }
  })

  const forecasts: Record<string, TeamWeekForecast> = {}
  const byeTeamsByWeek: Record<number, string[]> = {}
  const missingProjectionWeeks: number[] = []
  for (const { week, available, projections } of weeks) {
    if (!available) {
      missingProjectionWeeks.push(week)
      continue
    }
    const byeTeams = inferByeTeams(projections, players, nflTeams)
    byeTeamsByWeek[week] = [...byeTeams].sort()
    for (const team of teams) {
      forecasts[forecastKey(team.rosterId, week)] = forecastTeamWeek(
        {
          roster: { rosterId: team.rosterId, players: team.players, unavailable: team.unavailable },
          rosterPositions,
          projections,
          players,
          byeTeams,
        },
        week,
      )
    }
  }
  // Weeks without projections borrow the team's average forecast (or its scoring so far).
  for (const team of teams) {
    const known = weeks
      .filter((w) => w.available)
      .map((w) => forecasts[forecastKey(team.rosterId, w.week)])
      .filter((f): f is TeamWeekForecast => f !== undefined)
    const games = playedWeeks.length
    const mean =
      known.length > 0
        ? known.reduce((sum, f) => sum + f.mean, 0) / known.length
        : games > 0
          ? team.pointsFor / games
          : 0
    for (const week of missingProjectionWeeks) {
      forecasts[forecastKey(team.rosterId, week)] = {
        rosterId: team.rosterId,
        week,
        mean: Math.round(mean * 100) / 100,
        sd: FALLBACK_SD,
        lineup: { slots: [], bench: [], total: 0, emptySlots: 0, byes: [] },
      }
    }
  }

  return {
    leagueId,
    leagueName: league.name,
    season: String(league.season),
    currentWeek,
    lastRegularWeek,
    playedWeeks,
    remainingWeeks,
    inProgressWeek,
    playoffTeams,
    playoffRounds,
    playoffWeeks,
    reseed: num(league.settings?.playoff_seed_type) === 1,
    bracket,
    medianGame,
    divisions: num(league.settings?.divisions),
    rosterPositions,
    scoringKnown: Boolean(league.scoring_settings && Object.keys(league.scoring_settings).length),
    teams,
    schedule,
    forecasts,
    players,
    missingProjectionWeeks,
    byeTeamsByWeek,
    loadedAt: Date.now(),
  }
}

/** Only the fields the bracket replay reads, so the shape stays stable. */
function bracketMatch(row: SleeperBracketMatchup): BracketMatchLike {
  return {
    r: row.r,
    m: row.m,
    t1: row.t1 ?? null,
    t2: row.t2 ?? null,
    t1_from: row.t1_from ?? null,
    t2_from: row.t2_from ?? null,
    w: row.w ?? null,
    l: row.l ?? null,
    p: row.p ?? null,
  }
}

/** The simulation's input for loaded data, with the run count and seed the page chooses. */
export function simulationInput(data: PredictionData, runs: number, seed: number): SimulationInput {
  const forecasts: SimulationInput['forecasts'] = {}
  for (const [key, f] of Object.entries(data.forecasts)) forecasts[key] = { mean: f.mean, sd: f.sd }
  return {
    teams: data.teams.map((t) => ({
      rosterId: t.rosterId,
      wins: t.record.wins,
      losses: t.record.losses,
      ties: t.record.ties,
      pointsFor: t.pointsFor,
    })),
    schedule: data.schedule,
    forecasts,
    weeks: data.remainingWeeks,
    playoffTeams: data.playoffTeams,
    medianGame: data.medianGame,
    runs,
    seed,
    playoffs: playoffFormat(data),
  }
}

/** The bracket to play after each simulated regular season, if the rounds fit the NFL calendar. */
export function playoffFormat(data: PredictionData): PlayoffFormat | null {
  if (data.playoffRounds.length === 0 || data.playoffRounds.some((r) => r.length === 0)) return null
  return {
    rounds: data.playoffRounds,
    reseed: data.reseed,
    fixed: data.bracket && data.bracket.length > 0 ? winnersPath(data.bracket) : null,
  }
}
