/*
 * Trades and waivers, graded by what actually happened afterwards.
 *
 * Every completed trade, waiver claim and free-agent add is an acquisition
 * of a player by a roster from a given week. Each week a player scores for
 * a roster, those points are credited to the roster's most recent
 * acquisition of him (none = drafted or kept). Starter points are what
 * count: points a player scored while in the lineup, regular season only.
 *
 * A trade side's value is the starter points its incoming players scored
 * for it; its net is that minus what its outgoing players scored for their
 * new teams. Draft picks and FAAB that changed hands are listed, not valued.
 */
import type { SleeperMatchup, SleeperTransaction } from '../../lib/sleeper/types.ts'
import { round } from './common.ts'

export type MoveKind = 'trade' | 'waiver' | 'free_agent'

export interface Move {
  id: string
  kind: MoveKind
  week: number
  created: number
  /** player -> receiving roster */
  adds: Record<string, number>
  /** player -> releasing roster */
  drops: Record<string, number>
  rosterIds: number[]
  /** Winning FAAB bid on a waiver claim. */
  bid: number | null
  picks: { season: string; round: number; from: number; to: number }[]
  faab: { from: number; to: number; amount: number }[]
}

const KINDS = new Set<string>(['trade', 'waiver', 'free_agent'])

/** Completed trades, waiver claims and free-agent moves, oldest first. */
export function normaliseMoves(transactions: readonly SleeperTransaction[], week: number): Move[] {
  return transactions
    .filter((t) => t.status === 'complete' && KINDS.has(t.type))
    .map((t, i) => ({
      id: t.transaction_id ?? `${week}:${t.created ?? i}`,
      kind: t.type as MoveKind,
      week: t.leg ?? week,
      created: t.created ?? 0,
      adds: t.adds ?? {},
      drops: t.drops ?? {},
      rosterIds: t.roster_ids ?? [
        ...new Set([...Object.values(t.adds ?? {}), ...Object.values(t.drops ?? {})]),
      ],
      bid: t.settings?.waiver_bid ?? null,
      picks: (t.draft_picks ?? []).map((p) => ({
        season: p.season,
        round: p.round,
        from: p.previous_owner_id,
        to: p.owner_id,
      })),
      faab: (t.waiver_budget ?? []).map((b) => ({
        from: b.sender,
        to: b.receiver,
        amount: b.amount,
      })),
    }))
    .sort((a, b) => a.week - b.week || a.created - b.created)
}

export interface Credit {
  /** Starter points for the acquiring roster. */
  starterPoints: number
  /** Points while on the roster, bench included. */
  points: number
  starts: number
}

/** `${moveId}|${rosterId}|${playerId}` -> what that acquisition produced. */
export type Credits = Map<string, Credit>

const key = (moveId: string, rosterId: number, playerId: string) =>
  `${moveId}|${rosterId}|${playerId}`

/** Credit every rostered player-week to the roster's latest acquisition of that player. */
export function creditMoves(
  moves: readonly Move[],
  matchupsByWeek: Readonly<Record<number, readonly SleeperMatchup[]>>,
): Credits {
  // (roster, player) -> acquisitions, oldest first
  const acquisitions = new Map<string, Move[]>()
  for (const m of moves) {
    for (const [playerId, rosterId] of Object.entries(m.adds)) {
      const k = `${rosterId}|${playerId}`
      acquisitions.set(k, [...(acquisitions.get(k) ?? []), m])
    }
  }
  const credits: Credits = new Map()
  for (const [w, matchups] of Object.entries(matchupsByWeek)) {
    const week = Number(w)
    for (const m of matchups) {
      const starters = new Set(m.starters ?? [])
      for (const [playerId, raw] of Object.entries(m.players_points ?? {})) {
        const list = acquisitions.get(`${m.roster_id}|${playerId}`)
        if (!list) continue
        let move: Move | undefined
        for (const a of list) if (a.week <= week) move = a
        if (!move) continue
        const k = key(move.id, m.roster_id, playerId)
        const c = credits.get(k) ?? { starterPoints: 0, points: 0, starts: 0 }
        const pts = Number(raw) || 0
        c.points = round(c.points + pts)
        if (starters.has(playerId)) {
          c.starterPoints = round(c.starterPoints + pts)
          c.starts++
        }
        credits.set(k, c)
      }
    }
  }
  return credits
}

function creditFor(credits: Credits, moveId: string, rosterId: number, playerId: string): Credit {
  return credits.get(key(moveId, rosterId, playerId)) ?? { starterPoints: 0, points: 0, starts: 0 }
}

export interface TradeSide {
  rosterId: number
  received: ({ playerId: string } & Credit)[]
  sent: string[]
  picksReceived: Move['picks']
  faabReceived: number
  /** Starter points from the players received. */
  gained: number
  /** Starter points the players sent away scored for their new teams. */
  gaveUp: number
  net: number
}

export interface TradeGrade {
  id: string
  week: number
  sides: TradeSide[]
  /** Roster with the best net, or null when within EVEN_MARGIN. */
  winner: number | null
  /** Half the gap between the best and second-best net (the winner's net in a two-team trade). */
  margin: number
}

/** A trade decided by fewer starter points than this is called even. */
export const EVEN_MARGIN = 10

export function gradeTrades(moves: readonly Move[], credits: Credits): TradeGrade[] {
  return moves
    .filter((m) => m.kind === 'trade')
    .map((m) => {
      const sides = m.rosterIds.map((rosterId) => {
        const received = Object.entries(m.adds)
          .filter(([, r]) => r === rosterId)
          .map(([playerId]) => ({ playerId, ...creditFor(credits, m.id, rosterId, playerId) }))
        const sent = Object.entries(m.drops)
          .filter(([, r]) => r === rosterId)
          .map(([playerId]) => playerId)
        const gaveUp = sent.reduce((sum, playerId) => {
          const to = m.adds[playerId]
          return to === undefined ? sum : sum + creditFor(credits, m.id, to, playerId).starterPoints
        }, 0)
        const gained = received.reduce((s, r) => s + r.starterPoints, 0)
        return {
          rosterId,
          received,
          sent,
          picksReceived: m.picks.filter((p) => p.to === rosterId),
          faabReceived: m.faab.filter((f) => f.to === rosterId).reduce((s, f) => s + f.amount, 0),
          gained: round(gained),
          gaveUp: round(gaveUp),
          net: round(gained - gaveUp),
        }
      })
      const byNet = sides.slice().sort((a, b) => b.net - a.net)
      // Half the gap between the top two nets: in a two-team trade, what the winner won by.
      const margin = round(((byNet[0]?.net ?? 0) - (byNet[1]?.net ?? 0)) / 2)
      return {
        id: m.id,
        week: m.week,
        sides,
        winner: byNet[0] && margin >= EVEN_MARGIN ? byNet[0].rosterId : null,
        margin,
      }
    })
}

export interface Pickup extends Credit {
  moveId: string
  kind: 'waiver' | 'free_agent'
  week: number
  rosterId: number
  playerId: string
  bid: number | null
}

/** Every player added off waivers or free agency, with what he produced for the team. */
export function pickups(moves: readonly Move[], credits: Credits): Pickup[] {
  return moves
    .filter((m): m is Move & { kind: 'waiver' | 'free_agent' } => m.kind !== 'trade')
    .flatMap((m) =>
      Object.entries(m.adds).map(([playerId, rosterId]) => ({
        moveId: m.id,
        kind: m.kind,
        week: m.week,
        rosterId,
        playerId,
        bid: m.bid,
        ...creditFor(credits, m.id, rosterId, playerId),
      })),
    )
}

export interface ManagerMoves {
  rosterId: number
  trades: number
  tradesWon: number
  tradesLost: number
  /** Sum of trade nets. */
  tradeNet: number
  pickups: number
  /** Starter points from pickups. */
  pickupPoints: number
  faabSpent: number
  bestPickup: Pickup | null
}

export function managerMoves(
  rosterIds: readonly number[],
  trades: readonly TradeGrade[],
  adds: readonly Pickup[],
): ManagerMoves[] {
  return rosterIds.map((rosterId) => {
    const mine = trades.filter((t) => t.sides.some((s) => s.rosterId === rosterId))
    const myAdds = adds.filter((p) => p.rosterId === rosterId)
    let bestPickup: Pickup | null = null
    for (const p of myAdds)
      if (!bestPickup || p.starterPoints > bestPickup.starterPoints) bestPickup = p
    return {
      rosterId,
      trades: mine.length,
      tradesWon: mine.filter((t) => t.winner === rosterId).length,
      tradesLost: mine.filter((t) => t.winner !== null && t.winner !== rosterId).length,
      tradeNet: round(
        mine.reduce((s, t) => s + (t.sides.find((x) => x.rosterId === rosterId)?.net ?? 0), 0),
      ),
      pickups: myAdds.length,
      pickupPoints: round(myAdds.reduce((s, p) => s + p.starterPoints, 0)),
      faabSpent: myAdds.reduce((s, p) => s + (p.kind === 'waiver' ? (p.bid ?? 0) : 0), 0),
      bestPickup: bestPickup && bestPickup.starterPoints > 0 ? bestPickup : null,
    }
  })
}
