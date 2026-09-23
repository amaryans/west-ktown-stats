/*
 * Execution score: how close each manager's lineups came to the best lineup
 * they could have set with hindsight, plus where each team's points came
 * from (by position and by player).
 *
 * Works on Sleeper's weekly matchups, whose `players_points` covers every
 * rostered player (bench included) and whose `starters` lists the lineup in
 * slot order. The best lineup is solved exactly over the season's
 * `roster_positions`, reusing the predictions engine's assignment solver.
 */
import type { SleeperMatchup } from '../../lib/sleeper/types.ts'
import { assign, slotAccepts, startingSlots } from '../predictions/engine/lineup.ts'
import { mean, result, round } from './common.ts'

export interface ExecutionInput {
  rosterPositions: readonly string[]
  matchupsByWeek: Record<number, readonly SleeperMatchup[]>
  /** Positions a player can fill (Sleeper's fantasy_positions), or [] when unknown. */
  positionsOf: (playerId: string) => readonly string[]
  /** The player's main position, for the by-position breakdown. */
  primaryPosition: (playerId: string) => string | null
}

export interface PlayerPoints {
  playerId: string
  points: number
}

/** A bench player who belonged in the lineup, paired with a starter who didn't. */
export interface Benching {
  week: number
  rosterId: number
  benched: PlayerPoints
  /** null when the slot was left empty. */
  started: PlayerPoints | null
  /** Points lost by the swap. */
  cost: number
}

export interface RosterWeek {
  week: number
  rosterId: number
  actual: number
  optimal: number
  /** optimal - actual */
  left: number
  opponentRosterId: number | null
  opponentActual: number | null
  /** 1 win, 0.5 tie, 0 loss; null without an opponent. */
  result: 1 | 0.5 | 0 | null
  /** Lost or tied, but the best lineup would have outscored the opponent's actual score. */
  lineupLoss: boolean
  /** Starting slots left empty. */
  emptySlots: number
  benchings: Benching[]
  starters: PlayerPoints[]
}

const EMPTY = '0'

function pts(m: SleeperMatchup, id: string): number {
  return Number(m.players_points?.[id]) || 0
}

/** The best score this roster could have posted, given every rostered player's points. */
export function bestLineup(
  m: SleeperMatchup,
  rosterPositions: readonly string[],
  positionsOf: (playerId: string) => readonly string[],
): { total: number; players: string[] } {
  const slots = startingSlots(rosterPositions)
  const candidates = Object.keys(m.players_points ?? {}).filter((id) => positionsOf(id).length > 0)
  const weights = slots.map((slot) =>
    candidates.map((id) => (slotAccepts(slot, positionsOf(id)) ? Math.max(0, pts(m, id)) : -1)),
  )
  const chosen = assign(weights)
  const players: string[] = []
  let total = 0
  chosen.forEach((j) => {
    const id = j >= 0 ? candidates[j] : undefined
    if (!id) return
    players.push(id)
    total += Math.max(0, pts(m, id))
  })
  return { total: round(total), players }
}

/** Every roster's week, for every week with player-level scores. */
export function rosterWeeks(input: ExecutionInput): RosterWeek[] {
  const out: RosterWeek[] = []
  const weeks = Object.keys(input.matchupsByWeek)
    .map(Number)
    .sort((a, b) => a - b)
  for (const week of weeks) {
    const matchups = input.matchupsByWeek[week] ?? []
    const actualOf = new Map<number, number>()
    for (const m of matchups) {
      const starters = (m.starters ?? []).filter((id) => id && id !== EMPTY)
      actualOf.set(m.roster_id, round(starters.reduce((s, id) => s + pts(m, id), 0)))
    }
    for (const m of matchups) {
      if (!m.players_points || Object.keys(m.players_points).length === 0) continue
      const starterIds = m.starters ?? []
      const actual = actualOf.get(m.roster_id) ?? 0
      const best = bestLineup(m, input.rosterPositions, input.positionsOf)
      // Unknown positions or odd data can leave the solver short; never report
      // a best lineup worse than the one actually played.
      const optimal = Math.max(best.total, actual)
      const opp =
        m.matchup_id == null
          ? undefined
          : matchups.find((o) => o.matchup_id === m.matchup_id && o.roster_id !== m.roster_id)
      const opponentActual = opp ? (actualOf.get(opp.roster_id) ?? null) : null
      const res = opponentActual === null ? null : result(actual, opponentActual)

      const startedSet = new Set(starterIds.filter((id) => id && id !== EMPTY))
      const bestSet = new Set(best.total >= actual ? best.players : [...startedSet])
      const shouldHave = [...bestSet]
        .filter((id) => !startedSet.has(id))
        .map((id) => ({ playerId: id, points: pts(m, id) }))
        .sort((a, b) => b.points - a.points)
      // Starters (and empty slots) that aren't in the best lineup, with the slot they held.
      const slots = startingSlots(input.rosterPositions)
      const open = starterIds
        .map((id, i) => ({
          slot: slots[i] ?? 'FLEX',
          player: id && id !== EMPTY ? { playerId: id, points: pts(m, id) } : null,
        }))
        .filter((s) => !s.player || !bestSet.has(s.player.playerId))
        .sort((a, b) => (a.player?.points ?? -1) - (b.player?.points ?? -1))
      const emptySlots = starterIds.filter((id) => !id || id === EMPTY).length
      // Pair each benched player with the weakest open spot they could have filled.
      const benchings: Benching[] = []
      for (const benched of shouldHave) {
        let k = open.findIndex((s) => slotAccepts(s.slot, input.positionsOf(benched.playerId)))
        if (k < 0) k = 0
        const spot = open.splice(k, 1)[0]
        const started = spot?.player ?? null
        const cost = round(benched.points - (started?.points ?? 0))
        if (cost > 0) benchings.push({ week, rosterId: m.roster_id, benched, started, cost })
      }

      out.push({
        week,
        rosterId: m.roster_id,
        actual,
        optimal: round(optimal),
        left: round(optimal - actual),
        opponentRosterId: opp?.roster_id ?? null,
        opponentActual,
        result: res,
        lineupLoss: res !== null && res < 1 && opponentActual !== null && optimal > opponentActual,
        emptySlots,
        benchings,
        starters: [...startedSet].map((id) => ({ playerId: id, points: pts(m, id) })),
      })
    }
  }
  return out
}

export interface ExecutionLine {
  weeks: number
  actual: number
  optimal: number
  /** Points left on the bench. */
  left: number
  /** actual / optimal, 0–1. */
  efficiency: number | null
  /** Weeks with nothing left on the bench. */
  perfectWeeks: number
  /** Losses and ties the best lineup would have turned into wins. */
  lineupLosses: number
  emptySlots: number
  /** The week with the most points left on the bench. */
  worstWeek: RosterWeek | null
}

export function summarise(weeks: readonly RosterWeek[]): ExecutionLine {
  const actual = weeks.reduce((s, w) => s + w.actual, 0)
  const optimal = weeks.reduce((s, w) => s + w.optimal, 0)
  let worstWeek: RosterWeek | null = null
  for (const w of weeks) if (!worstWeek || w.left > worstWeek.left) worstWeek = w
  return {
    weeks: weeks.length,
    actual: round(actual),
    optimal: round(optimal),
    left: round(optimal - actual),
    efficiency: optimal > 0 ? actual / optimal : null,
    perfectWeeks: weeks.filter((w) => w.left < 0.005).length,
    lineupLosses: weeks.filter((w) => w.lineupLoss).length,
    emptySlots: weeks.reduce((s, w) => s + w.emptySlots, 0),
    worstWeek: worstWeek && worstWeek.left > 0 ? worstWeek : null,
  }
}

/** Execution per roster for one season. */
export function executionByRoster(weeks: readonly RosterWeek[]): Map<number, ExecutionLine> {
  const byRoster = new Map<number, RosterWeek[]>()
  for (const w of weeks) byRoster.set(w.rosterId, [...(byRoster.get(w.rosterId) ?? []), w])
  return new Map([...byRoster].map(([id, list]) => [id, summarise(list)]))
}

/** The costliest benchings, most points lost first. */
export function worstBenchings(weeks: readonly RosterWeek[], limit = 10): Benching[] {
  return weeks
    .flatMap((w) => w.benchings)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, limit)
}

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'LB', 'DB']

export interface PositionalBreakdown {
  positions: string[]
  rows: { rosterId: number; total: number; byPosition: Record<string, number> }[]
  /** Mean points per roster at each position. */
  leagueAverage: Record<string, number>
}

/** Starters' points by the player's main position (a flex counts as the player's position). */
export function positionalPoints(
  weeks: readonly RosterWeek[],
  primaryPosition: (playerId: string) => string | null,
): PositionalBreakdown {
  const rows = new Map<number, Record<string, number>>()
  const seen = new Set<string>()
  for (const w of weeks) {
    const row = rows.get(w.rosterId) ?? {}
    for (const s of w.starters) {
      const pos = primaryPosition(s.playerId) ?? 'Other'
      seen.add(pos)
      row[pos] = (row[pos] ?? 0) + s.points
    }
    rows.set(w.rosterId, row)
  }
  const positions = [...seen].sort((a, b) => {
    const ia = POSITION_ORDER.indexOf(a)
    const ib = POSITION_ORDER.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b)
  })
  const out = [...rows].map(([rosterId, byPosition]) => {
    const rounded = Object.fromEntries(positions.map((p) => [p, round(byPosition[p] ?? 0)]))
    return {
      rosterId,
      byPosition: rounded,
      total: round(Object.values(rounded).reduce((a, b) => a + b, 0)),
    }
  })
  const leagueAverage = Object.fromEntries(
    positions.map((p) => [p, round(mean(out.map((r) => r.byPosition[p] ?? 0)) ?? 0)]),
  )
  return { positions, rows: out, leagueAverage }
}

export interface Contributor {
  playerId: string
  /** Points scored while in the starting lineup. */
  points: number
  starts: number
  /** Share of the team's starting points. */
  share: number
}

/** Each roster's top scorers (starting points only). */
export function topContributors(
  weeks: readonly RosterWeek[],
  limit = 3,
): Map<number, Contributor[]> {
  const byRoster = new Map<number, Map<string, { points: number; starts: number }>>()
  const totals = new Map<number, number>()
  for (const w of weeks) {
    const players = byRoster.get(w.rosterId) ?? new Map()
    for (const s of w.starters) {
      const line = players.get(s.playerId) ?? { points: 0, starts: 0 }
      line.points += s.points
      line.starts += 1
      players.set(s.playerId, line)
    }
    byRoster.set(w.rosterId, players)
    totals.set(w.rosterId, (totals.get(w.rosterId) ?? 0) + w.actual)
  }
  return new Map(
    [...byRoster].map(([rosterId, players]) => {
      const total = totals.get(rosterId) ?? 0
      const top = [...players]
        .map(([playerId, l]) => ({
          playerId,
          points: round(l.points),
          starts: l.starts,
          share: total > 0 ? l.points / total : 0,
        }))
        .sort((a, b) => b.points - a.points)
        .slice(0, limit)
      return [rosterId, top]
    }),
  )
}
