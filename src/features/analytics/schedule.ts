/*
 * Schedule swap: every team's weekly scores replayed against every other
 * team's schedule. Cell [i][j] is team i's record had it played team j's
 * opponents. When team j's opponent that week was team i itself, team i
 * plays team j instead (the usual convention). The diagonal is the real
 * record.
 */
import type { SeasonStandings } from '../standings/history.ts'
import { rank, type RecordLine } from '../standings/standings.ts'
import { addResult, emptyLine, mean, result, round, winValue } from './common.ts'

export interface ScheduleSummary {
  rosterId: number
  actual: RecordLine
  /** Mean wins over every team's schedule, including its own. */
  avgWins: number
  /** Schedules this team would have had a better / worse record with. */
  betterWith: number
  worseWith: number
  bestSchedule: { rosterId: number; record: RecordLine } | null
  worstSchedule: { rosterId: number; record: RecordLine } | null
  /**
   * Mean wins the other teams would have had on this team's schedule:
   * lower means a harder schedule.
   */
  scheduleEase: number | null
}

export interface ScheduleSwap {
  /** Row and column order: head-to-head standings order. */
  rosterIds: number[]
  cells: RecordLine[][]
  summary: ScheduleSummary[]
}

export function scheduleSwap(season: Pick<SeasonStandings, 'teams'>): ScheduleSwap {
  const order = rank(season.teams, 'h2h').map((t) => t.rosterId)
  const weekly = new Map(
    season.teams.map((t) => [t.rosterId, new Map(t.weekly.map((w) => [w.week, w]))]),
  )

  const cells = order.map((a) =>
    order.map((b) => {
      const line = emptyLine()
      const mine = weekly.get(a)
      const theirs = weekly.get(b)
      if (!mine || !theirs) return line
      for (const [week, w] of mine) {
        const sched = theirs.get(week)
        if (!sched) continue
        const against =
          a === b
            ? w.opponentPoints
            : sched.opponentRosterId === a
              ? sched.points
              : sched.opponentPoints
        addResult(line, result(w.points, against))
      }
      return line
    }),
  )

  const summary = order.map((id, i) => {
    const row = cells[i] ?? []
    const actual = row[i] ?? emptyLine()
    const own = winValue(actual)
    let best: ScheduleSummary['bestSchedule'] = null
    let worst: ScheduleSummary['worstSchedule'] = null
    let betterWith = 0
    let worseWith = 0
    row.forEach((line, j) => {
      if (j === i) return
      const other = order[j] as number
      const w = winValue(line)
      if (w > own) betterWith++
      if (w < own) worseWith++
      if (!best || w > winValue(best.record)) best = { rosterId: other, record: line }
      if (!worst || w < winValue(worst.record)) worst = { rosterId: other, record: line }
    })
    const othersOnMine = cells.filter((_, k) => k !== i).map((r) => winValue(r[i] ?? emptyLine()))
    const ease = mean(othersOnMine)
    return {
      rosterId: id,
      actual,
      avgWins: round(mean(row.map(winValue)) ?? 0),
      betterWith,
      worseWith,
      bestSchedule: best,
      worstSchedule: worst,
      scheduleEase: ease === null ? null : round(ease),
    }
  })

  return { rosterIds: order, cells, summary }
}
