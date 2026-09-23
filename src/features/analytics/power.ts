/*
 * Power rankings, recomputed after every played week so movement can be shown.
 *
 * Two formulas:
 * - 'balanced' (0–100): 50% season all-play win %, 30% actual win % and 20%
 *   all-play win % over the team's last three games. Rewards scoring well
 *   every week, results that count, and current form.
 * - 'classic': the long-standing "Oberon Mt." rating,
 *   (avg × 6 + (high + low) × 2 + win % × 400) / 10. Points-heavy.
 *
 * Win % counts games vs. the median when the league plays them.
 */
import type { SeasonStandings } from '../standings/history.ts'
import type { RecordLine } from '../standings/standings.ts'
import { winPct } from '../standings/standings.ts'
import {
  addResult,
  emptyLine,
  games,
  mean,
  result,
  round,
  scoresByWeek,
  weeklyMedians,
  winValue,
} from './common.ts'

export type PowerFormula = 'balanced' | 'classic'

export const RECENT_WEEKS = 3

export interface PowerRow {
  rosterId: number
  score: number
  rank: number
  /** Rank after the previous played week; null in the first week. */
  prevRank: number | null
  avg: number
  high: number
  low: number
  record: RecordLine
  winPct: number
  allPlayPct: number
  /** All-play win % over the last RECENT_WEEKS games. */
  recentPct: number
  /** Rank after each played week, oldest first. */
  trend: number[]
}

export interface PowerRankings {
  weeks: number[]
  /** Standings as of the selected week (the latest played by default). */
  rows: PowerRow[]
}

interface TeamWeek {
  week: number
  points: number
  /** All-play share this week (0–1). */
  share: number
  /** Real result(s) this week: the game, plus the median game when on. */
  results: (1 | 0.5 | 0)[]
}

interface Snapshot {
  rosterId: number
  score: number
  avg: number
  high: number
  low: number
  record: RecordLine
  winPct: number
  allPlayPct: number
  recentPct: number
}

function snapshot(rosterId: number, weeks: TeamWeek[], formula: PowerFormula): Snapshot | null {
  if (weeks.length === 0) return null
  const pts = weeks.map((w) => w.points)
  const avg = mean(pts) ?? 0
  const high = Math.max(...pts)
  const low = Math.min(...pts)
  const record = emptyLine()
  for (const w of weeks) for (const r of w.results) addResult(record, r)
  const wp = winPct(record)
  const allPlayPct = mean(weeks.map((w) => w.share)) ?? 0
  const recentPct = mean(weeks.slice(-RECENT_WEEKS).map((w) => w.share)) ?? 0
  const score =
    formula === 'classic'
      ? (avg * 6 + (high + low) * 2 + wp * 400) / 10
      : 100 * (0.5 * allPlayPct + 0.3 * wp + 0.2 * recentPct)
  return {
    rosterId,
    score: round(score, 1),
    avg: round(avg),
    high,
    low,
    record,
    winPct: wp,
    allPlayPct,
    recentPct,
  }
}

function ranked(snaps: Snapshot[]): Map<number, number> {
  const order = snaps
    .slice()
    .sort((a, b) => b.score - a.score || b.avg - a.avg || a.rosterId - b.rosterId)
  return new Map(order.map((s, i) => [s.rosterId, i + 1]))
}

/**
 * Power rankings for a season as of `asOfWeek` (default: the latest played
 * week), with each team's rank after every earlier week.
 */
export function powerRankings(
  season: Pick<SeasonStandings, 'teams' | 'medianEnabled'>,
  formula: PowerFormula = 'balanced',
  asOfWeek = Infinity,
): PowerRankings {
  const byWeek = scoresByWeek(season, asOfWeek)
  const medians = weeklyMedians(byWeek)
  const perTeam = new Map<number, TeamWeek[]>(season.teams.map((t) => [t.rosterId, []]))

  for (const [week, scores] of byWeek) {
    const med = medians.get(week)
    for (const s of scores) {
      const line = emptyLine()
      for (const o of scores)
        if (o.rosterId !== s.rosterId) addResult(line, result(s.points, o.points))
      const results = [result(s.points, s.opponentPoints)]
      if (season.medianEnabled && med !== undefined) results.push(result(s.points, med))
      perTeam.get(s.rosterId)?.push({
        week,
        points: s.points,
        share: games(line) ? winValue(line) / games(line) : 0,
        results,
      })
    }
  }

  const weeks = [...byWeek.keys()]
  const trends = new Map<number, number[]>(season.teams.map((t) => [t.rosterId, []]))
  let prev = new Map<number, number>()
  let current = new Map<number, number>()
  let latest: Snapshot[] = []

  for (const week of weeks) {
    const snaps: Snapshot[] = []
    for (const [id, list] of perTeam) {
      const snap = snapshot(
        id,
        list.filter((w) => w.week <= week),
        formula,
      )
      if (snap) snaps.push(snap)
    }
    prev = current
    current = ranked(snaps)
    for (const [id, r] of current) trends.get(id)?.push(r)
    latest = snaps
  }

  const rows = latest
    .map((s) => ({
      ...s,
      rank: current.get(s.rosterId) ?? 0,
      prevRank: prev.get(s.rosterId) ?? null,
      trend: trends.get(s.rosterId) ?? [],
    }))
    .sort((a, b) => a.rank - b.rank)

  return { weeks, rows }
}
