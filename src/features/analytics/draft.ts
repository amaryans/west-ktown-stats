/*
 * Draft grades: every pick judged by how the player finished.
 *
 * A pick's value compares where the player was taken among his position
 * with where he finished at it (by points while on a roster in this league,
 * regular season): the 12th WR taken finishing WR3 is +9. Judging within
 * position keeps kickers and defenses, which score like mid-round receivers
 * but go last, from filling the steals list. Players with no known position
 * fall back to overall pick number minus overall finish. Keepers are left
 * out: keeper success grades those.
 *
 * A manager's draft is graded on the starter points their draft class
 * produced for them against the league average, since that is what a draft
 * is for; average pick value is shown alongside.
 */
import type { SleeperMatchup } from '../../lib/sleeper/types.ts'
import type { SuccessPick } from '../keepers/success.ts'
import { mean, round } from './common.ts'

export interface GradedPick extends SuccessPick {
  rosterId: number
  /** Points while on any roster in the league. */
  points: number
  /** Points while starting for the team that drafted him. */
  starterPoints: number
  starts: number
  /** Finish among all drafted non-keepers, 1 = most points. */
  finishRank: number
  /** Finish among drafted non-keepers at his position. */
  positionRank: number | null
  /** Order taken among drafted non-keepers at his position (1 = first). */
  positionPick: number | null
  /** positionPick - positionRank (or pickNo - finishRank without a position): positive is a steal. */
  value: number
}

export function gradePicks(
  picks: readonly SuccessPick[],
  matchupsByWeek: Readonly<Record<number, readonly SleeperMatchup[]>>,
): GradedPick[] {
  const drafted = picks.filter(
    (p): p is SuccessPick & { rosterId: number } => !p.isKeeper && p.rosterId !== null,
  )
  const points = new Map<string, number>()
  const starter = new Map<string, { points: number; starts: number }>()
  const draftedBy = new Map(drafted.map((p) => [p.playerId, p.rosterId]))
  for (const matchups of Object.values(matchupsByWeek)) {
    for (const m of matchups) {
      const starters = new Set(m.starters ?? [])
      for (const [playerId, raw] of Object.entries(m.players_points ?? {})) {
        if (!draftedBy.has(playerId)) continue
        const pts = Number(raw) || 0
        points.set(playerId, (points.get(playerId) ?? 0) + pts)
        if (draftedBy.get(playerId) === m.roster_id && starters.has(playerId)) {
          const s = starter.get(playerId) ?? { points: 0, starts: 0 }
          s.points += pts
          s.starts++
          starter.set(playerId, s)
        }
      }
    }
  }
  const order = drafted
    .slice()
    .sort(
      (a, b) =>
        (points.get(b.playerId) ?? 0) - (points.get(a.playerId) ?? 0) || a.pickNo - b.pickNo,
    )
  const finish = new Map(order.map((p, i) => [p.playerId, i + 1]))
  const posFinish = new Map<string, number>()
  const posCount = new Map<string, number>()
  for (const p of order) {
    if (!p.position) continue
    const n = (posCount.get(p.position) ?? 0) + 1
    posCount.set(p.position, n)
    posFinish.set(p.playerId, n)
  }
  const posPick = new Map<string, number>()
  const posTaken = new Map<string, number>()
  for (const p of drafted.slice().sort((a, b) => a.pickNo - b.pickNo)) {
    if (!p.position) continue
    const n = (posTaken.get(p.position) ?? 0) + 1
    posTaken.set(p.position, n)
    posPick.set(p.playerId, n)
  }
  return drafted.map((p) => {
    const finishRank = finish.get(p.playerId) ?? drafted.length
    const positionRank = posFinish.get(p.playerId) ?? null
    const positionPick = posPick.get(p.playerId) ?? null
    return {
      ...p,
      points: round(points.get(p.playerId) ?? 0),
      starterPoints: round(starter.get(p.playerId)?.points ?? 0),
      starts: starter.get(p.playerId)?.starts ?? 0,
      finishRank,
      positionRank,
      positionPick,
      value:
        positionRank !== null && positionPick !== null
          ? positionPick - positionRank
          : p.pickNo - finishRank,
    }
  })
}

export interface DraftSummary {
  rosterId: number
  picks: number
  /** Starter points the draft class produced for this team. */
  starterPoints: number
  /** starterPoints minus the league average. */
  vsAverage: number
  avgValue: number | null
  /** 1 = best draft of the season. */
  rank: number
  best: GradedPick | null
  worst: GradedPick | null
}

export function summariseDrafts(graded: readonly GradedPick[]): DraftSummary[] {
  const byRoster = new Map<number, GradedPick[]>()
  for (const p of graded) byRoster.set(p.rosterId, [...(byRoster.get(p.rosterId) ?? []), p])
  const rows = [...byRoster].map(([rosterId, list]) => {
    let best: GradedPick | null = null
    let worst: GradedPick | null = null
    for (const p of list) {
      if (!best || p.value > best.value) best = p
      if (!worst || p.value < worst.value) worst = p
    }
    const avg = mean(list.map((p) => p.value))
    return {
      rosterId,
      picks: list.length,
      starterPoints: round(list.reduce((s, p) => s + p.starterPoints, 0)),
      avgValue: avg === null ? null : round(avg, 1),
      best,
      worst,
    }
  })
  const leagueAvg = mean(rows.map((r) => r.starterPoints)) ?? 0
  const ranked = rows
    .slice()
    .sort((a, b) => b.starterPoints - a.starterPoints)
    .map((r) => r.rosterId)
  return rows.map((r) => ({
    ...r,
    vsAverage: round(r.starterPoints - leagueAvg),
    rank: ranked.indexOf(r.rosterId) + 1,
  }))
}

/** Biggest steals and busts. Busts only look at the first `bustRounds` rounds. */
export function stealsAndBusts<T extends GradedPick>(
  graded: readonly T[],
  limit = 5,
  bustRounds = 5,
): { steals: T[]; busts: T[] } {
  return {
    steals: graded
      .slice()
      .sort((a, b) => b.value - a.value || b.points - a.points)
      .slice(0, limit),
    busts: graded
      .filter((p) => p.round <= bustRounds)
      .sort((a, b) => a.value - b.value || a.points - b.points)
      .slice(0, limit),
  }
}
