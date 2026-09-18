/*
 * Pure standings math for a Sleeper league season. No DOM, no fetch.
 * Ported from the original west-ktown-stats standings.js.
 */
import type {
  SleeperLeague,
  SleeperMatchup,
  SleeperRoster,
  SleeperState,
  SleeperUser,
} from '../../lib/sleeper/types.ts'

export interface RecordLine {
  wins: number
  losses: number
  ties: number
}

export interface WeeklyResult {
  week: number
  points: number
  opponentRosterId: number
  opponentPoints: number
}

export interface SeasonTeam {
  rosterId: number
  ownerId: string | null
  ownerName: string
  teamName: string
  avatar: string | null
  teamAvatarUrl: string | null
  h2h: RecordLine
  median: RecordLine
  combined: RecordLine
  pointsFor: number
  pointsAgainst: number
  weekly: WeeklyResult[]
}

export type RankedTeam = SeasonTeam & { rank: number }

export type RankMode = 'h2h' | 'combined'

function num(x: unknown): number {
  const n = Number(x)
  return Number.isFinite(n) ? n : 0
}

function round2(x: number): number {
  return Math.round(x * 100) / 100
}

/** Median of a numeric array (average of the two middle values when even). */
export function median(values: readonly number[]): number | null {
  const sorted = values.slice().sort((a, b) => a - b)
  const n = sorted.length
  if (n === 0) return null
  const mid = Math.floor(n / 2)
  return n % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
}

/**
 * A week counts as "played" if at least one roster scored points.
 * Sleeper returns matchup objects with 0 points for weeks that haven't happened yet.
 */
export function weekWasPlayed(matchups: readonly SleeperMatchup[] | null | undefined): boolean {
  return Array.isArray(matchups) && matchups.some((m) => num(m.points) > 0)
}

function emptyLine(): RecordLine {
  return { wins: 0, losses: 0, ties: 0 }
}

export function winPct(line: RecordLine): number {
  const games = line.wins + line.losses + line.ties
  return games === 0 ? 0 : (line.wins + line.ties / 2) / games
}

export function formatRecord(line: RecordLine): string {
  return line.ties ? `${line.wins}-${line.losses}-${line.ties}` : `${line.wins}-${line.losses}`
}

export function addLines(a: RecordLine, b: RecordLine): RecordLine {
  return { wins: a.wins + b.wins, losses: a.losses + b.losses, ties: a.ties + b.ties }
}

export interface ComputeSeasonInput {
  rosters: readonly SleeperRoster[]
  users: readonly SleeperUser[]
  matchupsByWeek: Record<number, readonly SleeperMatchup[]>
}

/** Build a season's standings from rosters, users and regular-season matchups. */
export function computeSeason({ rosters, users, matchupsByWeek }: ComputeSeasonInput): {
  teams: SeasonTeam[]
  weeksPlayed: number[]
} {
  const usersById = new Map((users || []).map((u) => [u.user_id, u]))
  const teams = new Map<number, SeasonTeam>()

  for (const r of rosters || []) {
    const owner = r.owner_id ? usersById.get(r.owner_id) : undefined
    const meta = owner?.metadata ?? {}
    const displayName = owner?.display_name || 'Unknown owner'
    teams.set(r.roster_id, {
      rosterId: r.roster_id,
      ownerId: r.owner_id || null,
      ownerName: displayName,
      teamName: meta.team_name || displayName,
      avatar: owner?.avatar || null,
      teamAvatarUrl: meta.avatar || null,
      h2h: emptyLine(),
      median: emptyLine(),
      combined: emptyLine(),
      pointsFor: 0,
      pointsAgainst: 0,
      weekly: [],
    })
  }

  const weeks = Object.keys(matchupsByWeek || {})
    .map(Number)
    .filter((w) => Number.isFinite(w))
    .sort((a, b) => a - b)

  const weeksPlayed: number[] = []

  for (const week of weeks) {
    const matchups = matchupsByWeek[week] ?? []
    if (!weekWasPlayed(matchups)) continue
    weeksPlayed.push(week)

    const byMatchup = new Map<number, { team: SeasonTeam; pts: number }[]>()
    const scores: number[] = []
    for (const m of matchups) {
      const team = teams.get(m.roster_id)
      if (!team) continue
      const pts = num(m.points)
      scores.push(pts)
      team.pointsFor += pts
      if (m.matchup_id == null) continue // bye week
      if (!byMatchup.has(m.matchup_id)) byMatchup.set(m.matchup_id, [])
      byMatchup.get(m.matchup_id)?.push({ team, pts })
    }

    for (const sides of byMatchup.values()) {
      if (sides.length !== 2) continue // malformed / bye
      const [a, b] = sides as [{ team: SeasonTeam; pts: number }, { team: SeasonTeam; pts: number }]
      a.team.pointsAgainst += b.pts
      b.team.pointsAgainst += a.pts
      if (a.pts > b.pts) {
        a.team.h2h.wins++
        b.team.h2h.losses++
      } else if (a.pts < b.pts) {
        b.team.h2h.wins++
        a.team.h2h.losses++
      } else {
        a.team.h2h.ties++
        b.team.h2h.ties++
      }
      a.team.weekly.push({
        week,
        points: a.pts,
        opponentRosterId: b.team.rosterId,
        opponentPoints: b.pts,
      })
      b.team.weekly.push({
        week,
        points: b.pts,
        opponentRosterId: a.team.rosterId,
        opponentPoints: a.pts,
      })
    }

    // Game against the league median: above is a win, below a loss, exactly on it a tie.
    const med = median(scores)
    if (med == null) continue
    for (const m of matchups) {
      const team = teams.get(m.roster_id)
      if (!team) continue
      const pts = num(m.points)
      if (pts > med) team.median.wins++
      else if (pts < med) team.median.losses++
      else team.median.ties++
    }
  }

  const list = Array.from(teams.values()).map((t) => ({
    ...t,
    combined: addLines(t.h2h, t.median),
    pointsFor: round2(t.pointsFor),
    pointsAgainst: round2(t.pointsAgainst),
  }))

  return { teams: list, weeksPlayed }
}

/** Sort teams for display. Tiebreaker after win percentage is points for (Sleeper's default). */
export function rank(teams: readonly SeasonTeam[], mode: RankMode): RankedTeam[] {
  const key = mode === 'combined' ? 'combined' : 'h2h'
  return teams
    .slice()
    .sort((a, b) => {
      const pct = winPct(b[key]) - winPct(a[key])
      if (pct !== 0) return pct
      if (b[key].wins !== a[key].wins) return b[key].wins - a[key].wins
      if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor
      return a.pointsAgainst - b.pointsAgainst
    })
    .map((t, i) => ({ ...t, rank: i + 1 }))
}

/**
 * Which weeks make up the regular season for a league, given its settings and the NFL state.
 * Returns an array of week numbers to fetch.
 */
export function regularSeasonWeeks(
  league: Pick<SleeperLeague, 'season' | 'settings'>,
  nflState: Pick<SleeperState, 'season' | 'season_type' | 'week'> | null | undefined,
): number[] {
  const settings = league?.settings ?? {}
  let lastRegularWeek = num(settings.playoff_week_start) - 1
  if (lastRegularWeek <= 0) {
    // No playoffs configured; fall back to the length of the NFL regular season for that year.
    lastRegularWeek = num(league.season) >= 2021 ? 18 : 17
  }
  let lastWeek = lastRegularWeek
  if (nflState && String(nflState.season) === String(league.season)) {
    if (nflState.season_type === 'pre' || nflState.season_type === 'off') {
      // "off" after the season means everything is played; "pre" before it means nothing is.
      if (num(nflState.week) <= 1 && nflState.season_type === 'pre') lastWeek = 0
    } else if (nflState.season_type === 'regular') {
      // Include the current week too: if it hasn't started, weekWasPlayed() will drop it.
      lastWeek = Math.min(lastRegularWeek, num(nflState.week))
    }
  }
  const weeks: number[] = []
  for (let w = 1; w <= lastWeek; w++) weeks.push(w)
  return weeks
}
