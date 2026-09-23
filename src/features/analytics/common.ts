/*
 * Shared helpers for the analytics modules. Everything here works on the
 * team-level weekly results already held in `LeagueHistory` (one score per
 * team per regular-season week), so no extra Sleeper requests are needed.
 */
import type { LeagueHistory, SeasonStandings } from '../standings/history.ts'
import { median, type RecordLine, type SeasonTeam } from '../standings/standings.ts'

export interface WeekScore {
  rosterId: number
  points: number
  opponentRosterId: number
  opponentPoints: number
}

export function emptyLine(): RecordLine {
  return { wins: 0, losses: 0, ties: 0 }
}

export function games(line: RecordLine): number {
  return line.wins + line.losses + line.ties
}

export function round(x: number, places = 2): number {
  const f = 10 ** places
  return Math.round(x * f) / f
}

export function mean(values: readonly number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
}

/** Population standard deviation. */
export function stdDev(values: readonly number[]): number | null {
  const m = mean(values)
  if (m === null) return null
  return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length)
}

/** True when a season has week-by-week results (manual and summary-only seasons do not). */
export function hasWeekly(season: Pick<SeasonStandings, 'teams'>): boolean {
  return season.teams.some((t) => t.weekly.length > 0)
}

/** Seasons with weekly results, newest first. */
export function weeklySeasons(history: LeagueHistory): SeasonStandings[] {
  return history.seasons.filter(hasWeekly)
}

/**
 * Every played week's scores, ascending by week. Only teams that played a
 * head-to-head game that week appear (the standings drop bye weeks).
 * `throughWeek` limits the result to weeks up to and including it.
 */
export function scoresByWeek(
  season: Pick<SeasonStandings, 'teams'>,
  throughWeek = Infinity,
): Map<number, WeekScore[]> {
  const byWeek = new Map<number, WeekScore[]>()
  for (const team of season.teams) {
    for (const w of team.weekly) {
      if (w.week > throughWeek) continue
      const list = byWeek.get(w.week) ?? []
      list.push({
        rosterId: team.rosterId,
        points: w.points,
        opponentRosterId: w.opponentRosterId,
        opponentPoints: w.opponentPoints,
      })
      byWeek.set(w.week, list)
    }
  }
  return new Map([...byWeek.entries()].sort((a, b) => a[0] - b[0]))
}

/** Median score of each played week. */
export function weeklyMedians(byWeek: Map<number, WeekScore[]>): Map<number, number> {
  const out = new Map<number, number>()
  for (const [week, scores] of byWeek) {
    const med = median(scores.map((s) => s.points))
    if (med !== null) out.set(week, med)
  }
  return out
}

/** Win (1), tie (0.5) or loss (0) for a score against another. */
export function result(points: number, against: number): 1 | 0.5 | 0 {
  return points > against ? 1 : points < against ? 0 : 0.5
}

export function addResult(line: RecordLine, r: 1 | 0.5 | 0): void {
  if (r === 1) line.wins++
  else if (r === 0) line.losses++
  else line.ties++
}

/** Wins with ties counted as half a win. */
export function winValue(line: RecordLine): number {
  return line.wins + line.ties / 2
}

export function teamById(season: Pick<SeasonStandings, 'teams'>): Map<number, SeasonTeam> {
  return new Map(season.teams.map((t) => [t.rosterId, t]))
}

/** Where a result happened, for record books and award lists. */
export interface TeamRef {
  season: string
  rosterId: number
  ownerId: string | null
  ownerName: string
  teamName: string
}

export function teamRef(season: Pick<SeasonStandings, 'season'>, team: SeasonTeam): TeamRef {
  return {
    season: season.season,
    rosterId: team.rosterId,
    ownerId: team.ownerId,
    ownerName: team.ownerName,
    teamName: team.teamName,
  }
}
