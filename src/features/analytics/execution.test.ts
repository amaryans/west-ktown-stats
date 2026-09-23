import {
  bestLineup,
  executionByRoster,
  positionalPoints,
  rosterWeeks,
  topContributors,
  worstBenchings,
  type ExecutionInput,
} from './execution.ts'

const POS: Record<string, string[]> = {
  q1: ['QB'],
  q2: ['QB'],
  r1: ['RB'],
  r2: ['RB'],
  r3: ['RB'],
  w1: ['WR'],
  w2: ['WR'],
  w3: ['WR'],
  t1: ['TE'],
}

// Roster 1 starts r2 (3) at flex and benches w2 (15): 12 points left.
// Roster 2 leaves its flex empty with nobody on the bench.
const input: ExecutionInput = {
  rosterPositions: ['QB', 'RB', 'WR', 'FLEX', 'BN', 'BN'],
  positionsOf: (id) => POS[id] ?? [],
  primaryPosition: (id) => POS[id]?.[0] ?? null,
  matchupsByWeek: {
    1: [
      {
        roster_id: 1,
        matchup_id: 1,
        points: 38,
        starters: ['q1', 'r1', 'w1', 'r2'],
        players_points: { q1: 20, r1: 5, w1: 10, r2: 3, w2: 15, t1: 8 },
      },
      {
        roster_id: 2,
        matchup_id: 1,
        points: 40,
        starters: ['q2', 'r3', 'w3', '0'],
        players_points: { q2: 10, r3: 10, w3: 20 },
      },
    ],
  },
}

test('best lineup fills flex slots exactly', () => {
  const m = input.matchupsByWeek[1]?.[0]
  if (!m) throw new Error('fixture')
  expect(bestLineup(m, input.rosterPositions, input.positionsOf)).toEqual({
    total: 50,
    players: ['q1', 'r1', 'w2', 'w1'],
  })
})

test('roster weeks: points left, benchings, empty slots and lineup losses', () => {
  const weeks = rosterWeeks(input)
  const r1 = weeks.find((w) => w.rosterId === 1)
  const r2 = weeks.find((w) => w.rosterId === 2)
  expect(r1).toMatchObject({ actual: 38, optimal: 50, left: 12, result: 0, lineupLoss: true })
  expect(r1?.benchings).toEqual([
    {
      week: 1,
      rosterId: 1,
      benched: { playerId: 'w2', points: 15 },
      started: { playerId: 'r2', points: 3 },
      cost: 12,
    },
  ])
  expect(r2).toMatchObject({ actual: 40, optimal: 40, left: 0, emptySlots: 1, lineupLoss: false })
})

test('season summary and costliest benchings', () => {
  const weeks = rosterWeeks(input)
  const byRoster = executionByRoster(weeks)
  expect(byRoster.get(1)).toMatchObject({ left: 12, perfectWeeks: 0, lineupLosses: 1 })
  expect(byRoster.get(1)?.efficiency).toBeCloseTo(38 / 50)
  expect(byRoster.get(2)).toMatchObject({ efficiency: 1, perfectWeeks: 1, emptySlots: 1 })
  expect(worstBenchings(weeks)[0]?.cost).toBe(12)
})

test('points by position and top contributors come from starters', () => {
  const weeks = rosterWeeks(input)
  const breakdown = positionalPoints(weeks, input.primaryPosition)
  expect(breakdown.positions).toEqual(['QB', 'RB', 'WR'])
  expect(breakdown.rows.find((r) => r.rosterId === 1)?.byPosition).toEqual({
    QB: 20,
    RB: 8,
    WR: 10,
  })
  expect(breakdown.leagueAverage.QB).toBe(15)
  const top = topContributors(weeks).get(1)
  expect(top?.[0]).toMatchObject({ playerId: 'q1', points: 20, starts: 1 })
  expect(top?.[0]?.share).toBeCloseTo(20 / 38)
})

test('a player with no known position cannot be placed, and the best never drops below actual', () => {
  const weeks = rosterWeeks({ ...input, positionsOf: () => [] })
  expect(weeks.find((w) => w.rosterId === 1)).toMatchObject({ optimal: 38, left: 0 })
})

test('a benched player is paired with a spot they could have filled', () => {
  // Started q1 (2) at QB and left the flex empty; q2 (25) and w2 (9) sat on the bench.
  const weeks = rosterWeeks({
    ...input,
    matchupsByWeek: {
      1: [
        {
          roster_id: 1,
          matchup_id: null,
          points: 17,
          starters: ['q1', 'r1', 'w1', '0'],
          players_points: { q1: 2, q2: 25, r1: 5, w1: 10, w2: 9 },
        },
      ],
    },
  })
  expect(weeks[0]?.benchings).toEqual([
    expect.objectContaining({
      benched: { playerId: 'q2', points: 25 },
      started: { playerId: 'q1', points: 2 },
      cost: 23,
    }),
    expect.objectContaining({ benched: { playerId: 'w2', points: 9 }, started: null, cost: 9 }),
  ])
})
