/** Strength of the remaining schedule: how much each team's upcoming opponents project to score. */
import { forecastKey } from './forecast.ts'
import type { ScheduledGame } from './types.ts'

export interface RemainingStrength {
  rosterId: number
  games: number
  /** Average projected score of the remaining opponents, null with no games left. */
  opponentAverage: number | null
  /** 1 = hardest remaining schedule. */
  rank: number
}

export function remainingStrength(
  rosterIds: readonly number[],
  schedule: readonly ScheduledGame[],
  forecasts: Record<string, { mean: number }>,
): RemainingStrength[] {
  const totals = new Map<number, { games: number; sum: number }>()
  for (const id of rosterIds) totals.set(id, { games: 0, sum: 0 })
  const add = (team: number, opponent: number, week: number) => {
    const t = totals.get(team)
    const f = forecasts[forecastKey(opponent, week)]
    if (!t || !f) return
    t.games++
    t.sum += f.mean
  }
  for (const g of schedule) {
    add(g.home, g.away, g.week)
    add(g.away, g.home, g.week)
  }
  const rows = rosterIds.map((rosterId) => {
    const t = totals.get(rosterId) ?? { games: 0, sum: 0 }
    return {
      rosterId,
      games: t.games,
      opponentAverage: t.games > 0 ? Math.round((t.sum / t.games) * 100) / 100 : null,
      rank: 0,
    }
  })
  const ranked = rows.slice().sort((a, b) => (b.opponentAverage ?? -1) - (a.opponentAverage ?? -1))
  ranked.forEach((r, i) => (r.rank = i + 1))
  return rows
}
