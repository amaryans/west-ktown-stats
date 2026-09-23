/*
 * Consistency and close games: how steady a team's scoring is, how often it
 * booms or busts against the rest of the league, and how it fares in games
 * decided by a few points.
 */
import type { LeagueHistory, SeasonStandings } from '../standings/history.ts'
import type { RecordLine } from '../standings/standings.ts'
import {
  addResult,
  emptyLine,
  mean,
  result,
  round,
  scoresByWeek,
  stdDev,
  weeklyMedians,
  weeklySeasons,
} from './common.ts'

/** Games decided by less than this many points count as close. */
export const CLOSE_MARGIN = 10

interface GameEntry {
  points: number
  opponentPoints: number
  weekMedian: number
  /** League-wide mean and sd of every score that season. */
  leagueMean: number
  leagueSd: number
}

export interface ConsistencyLine {
  games: number
  avg: number | null
  sd: number | null
  /** sd / avg: lower is steadier. */
  cv: number | null
  floor: number | null
  ceiling: number | null
  /** Scores at least one league sd above the league mean. */
  booms: number
  /** Scores at least one league sd below the league mean. */
  busts: number
  /** Share of weeks scoring above the weekly median. */
  aboveMedianPct: number | null
  close: RecordLine
  avgWinMargin: number | null
  avgLossMargin: number | null
  /** Highest score in a loss. */
  bestLoss: number | null
  /** Lowest score in a win. */
  worstWin: number | null
}

export interface SeasonConsistency extends ConsistencyLine {
  rosterId: number
}

export interface CareerConsistency extends ConsistencyLine {
  ownerId: string
  ownerName: string
}

function line(entries: GameEntry[]): ConsistencyLine {
  const pts = entries.map((e) => e.points)
  const avg = mean(pts)
  const sd = stdDev(pts)
  const close = emptyLine()
  const winMargins: number[] = []
  const lossMargins: number[] = []
  let booms = 0
  let busts = 0
  let aboveMedian = 0
  let bestLoss: number | null = null
  let worstWin: number | null = null
  for (const e of entries) {
    const margin = e.points - e.opponentPoints
    const r = result(e.points, e.opponentPoints)
    if (Math.abs(margin) < CLOSE_MARGIN) addResult(close, r)
    if (r === 1) {
      winMargins.push(margin)
      worstWin = worstWin === null ? e.points : Math.min(worstWin, e.points)
    }
    if (r === 0) {
      lossMargins.push(-margin)
      bestLoss = bestLoss === null ? e.points : Math.max(bestLoss, e.points)
    }
    if (e.points >= e.leagueMean + e.leagueSd) booms++
    if (e.points <= e.leagueMean - e.leagueSd) busts++
    if (e.points > e.weekMedian) aboveMedian++
  }
  const winM = mean(winMargins)
  const lossM = mean(lossMargins)
  return {
    games: entries.length,
    avg: avg === null ? null : round(avg),
    sd: sd === null ? null : round(sd),
    cv: avg && sd !== null ? round(sd / avg, 3) : null,
    floor: pts.length ? Math.min(...pts) : null,
    ceiling: pts.length ? Math.max(...pts) : null,
    booms,
    busts,
    aboveMedianPct: entries.length ? aboveMedian / entries.length : null,
    close,
    avgWinMargin: winM === null ? null : round(winM),
    avgLossMargin: lossM === null ? null : round(lossM),
    bestLoss,
    worstWin,
  }
}

function seasonEntries(season: Pick<SeasonStandings, 'teams'>): Map<number, GameEntry[]> {
  const byWeek = scoresByWeek(season)
  const medians = weeklyMedians(byWeek)
  const all = [...byWeek.values()].flat().map((s) => s.points)
  const leagueMean = mean(all) ?? 0
  const leagueSd = stdDev(all) ?? 0
  const out = new Map<number, GameEntry[]>(season.teams.map((t) => [t.rosterId, []]))
  for (const [week, scores] of byWeek) {
    for (const s of scores) {
      out.get(s.rosterId)?.push({
        points: s.points,
        opponentPoints: s.opponentPoints,
        weekMedian: medians.get(week) ?? 0,
        leagueMean,
        leagueSd,
      })
    }
  }
  return out
}

export function seasonConsistency(season: Pick<SeasonStandings, 'teams'>): SeasonConsistency[] {
  const entries = seasonEntries(season)
  return season.teams.map((t) => ({ rosterId: t.rosterId, ...line(entries.get(t.rosterId) ?? []) }))
}

/** Every weekly score an owner has posted, booms and busts judged within each season. */
export function careerConsistency(history: LeagueHistory): CareerConsistency[] {
  const entries = new Map<string, GameEntry[]>()
  const names = new Map<string, string>()
  for (const season of weeklySeasons(history).slice().reverse()) {
    const bySeason = seasonEntries(season)
    for (const t of season.teams) {
      if (!t.ownerId) continue
      const list = bySeason.get(t.rosterId) ?? []
      if (list.length === 0) continue
      names.set(t.ownerId, t.ownerName)
      entries.set(t.ownerId, [...(entries.get(t.ownerId) ?? []), ...list])
    }
  }
  return [...entries.entries()].map(([ownerId, list]) => ({
    ownerId,
    ownerName: names.get(ownerId) ?? 'Unknown owner',
    ...line(list),
  }))
}
