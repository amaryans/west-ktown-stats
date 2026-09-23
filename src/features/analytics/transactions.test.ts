import type { SleeperMatchup, SleeperTransaction } from '../../lib/sleeper/types.ts'
import { creditMoves, gradeTrades, managerMoves, normaliseMoves, pickups } from './transactions.ts'

const tx: Record<number, SleeperTransaction[]> = {
  1: [
    {
      type: 'free_agent',
      status: 'complete',
      transaction_id: 'fa1',
      leg: 1,
      created: 1,
      adds: { p1: 1 },
      roster_ids: [1],
    },
    { type: 'waiver', status: 'failed', transaction_id: 'no', leg: 1, created: 2, adds: { p9: 2 } },
    {
      type: 'commissioner',
      status: 'complete',
      transaction_id: 'co',
      leg: 1,
      created: 3,
      adds: { p8: 2 },
    },
  ],
  2: [
    {
      type: 'trade',
      status: 'complete',
      transaction_id: 't1',
      leg: 2,
      created: 4,
      adds: { a1: 2, b1: 1 },
      drops: { a1: 1, b1: 2 },
      roster_ids: [1, 2],
      draft_picks: [{ season: '2025', round: 2, roster_id: 1, previous_owner_id: 1, owner_id: 2 }],
    },
  ],
  3: [
    {
      type: 'waiver',
      status: 'complete',
      transaction_id: 'w1',
      leg: 3,
      created: 5,
      adds: { p2: 2 },
      roster_ids: [2],
      settings: { waiver_bid: 12 },
    },
  ],
}

const matchups: Record<number, SleeperMatchup[]> = {
  1: [
    {
      roster_id: 1,
      matchup_id: 1,
      points: 15,
      starters: ['a1', 'p1'],
      players_points: { a1: 10, p1: 5 },
    },
    { roster_id: 2, matchup_id: 1, points: 8, starters: ['b1'], players_points: { b1: 8 } },
  ],
  2: [
    {
      roster_id: 1,
      matchup_id: 1,
      points: 23,
      starters: ['b1', 'p1'],
      players_points: { b1: 20, p1: 3 },
    },
    { roster_id: 2, matchup_id: 1, points: 7, starters: ['a1'], players_points: { a1: 7 } },
  ],
  3: [
    {
      roster_id: 1,
      matchup_id: 1,
      points: 15,
      starters: ['b1'],
      players_points: { b1: 15, p1: 9 },
    },
    {
      roster_id: 2,
      matchup_id: 1,
      points: 17,
      starters: ['a1', 'p2'],
      players_points: { a1: 6, p2: 11 },
    },
  ],
}

const moves = Object.entries(tx).flatMap(([w, list]) => normaliseMoves(list, Number(w)))
const credits = creditMoves(moves, matchups)

test('only completed trades, waivers and free-agent moves count', () => {
  expect(moves.map((m) => m.id)).toEqual(['fa1', 't1', 'w1'])
  expect(moves[2]?.bid).toBe(12)
})

test('a pickup is credited with what he scored for the team from then on', () => {
  const adds = pickups(moves, credits)
  expect(adds.find((p) => p.playerId === 'p1')).toMatchObject({
    starterPoints: 8,
    points: 17,
    starts: 2,
  })
  expect(adds.find((p) => p.playerId === 'p2')).toMatchObject({ starterPoints: 11, bid: 12 })
})

test('trades are graded on starter points gained minus given up', () => {
  const [trade] = gradeTrades(moves, credits)
  expect(trade?.sides.find((s) => s.rosterId === 1)).toMatchObject({
    gained: 35,
    gaveUp: 13,
    net: 22,
  })
  expect(trade?.sides.find((s) => s.rosterId === 2)).toMatchObject({
    net: -22,
    picksReceived: [{ season: '2025', round: 2, from: 1, to: 2 }],
  })
  expect(trade).toMatchObject({ winner: 1, margin: 22 })
})

test('manager totals', () => {
  const rows = managerMoves([1, 2], gradeTrades(moves, credits), pickups(moves, credits))
  expect(rows.find((r) => r.rosterId === 2)).toMatchObject({
    trades: 1,
    tradesLost: 1,
    tradeNet: -22,
    pickups: 1,
    pickupPoints: 11,
    faabSpent: 12,
  })
  expect(rows.find((r) => r.rosterId === 1)?.bestPickup?.playerId).toBe('p1')
})
