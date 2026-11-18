import { describe, expect, it } from 'vitest'
import { clinchStatuses, type WeekResult } from './clinch.ts'
import { mulberry32 } from './rng.ts'
import { clinchScenarios, scenarioChances, type ScenarioGoal } from './scenarios.ts'
import type { RecordInput, ScheduledGame } from './types.ts'

const team = (rosterId: number, wins: number, losses: number): RecordInput => ({
  rosterId,
  wins,
  losses,
  ties: 0,
  pointsFor: 0,
})

const key = (r: WeekResult) =>
  r.kind === 'game' ? `g${r.week}:${r.winner}>${r.loser}` : `m${r.week}:${r.rosterId}:${r.won}`

/** Every full set of results for one week. */
function allOutcomes(
  teams: number[],
  games: ScheduledGame[],
  week: number,
  median: boolean,
): WeekResult[][] {
  let out: WeekResult[][] = [[]]
  for (const g of games) {
    out = out.flatMap((o) => [
      [...o, { kind: 'game' as const, week, winner: g.home, loser: g.away }],
      [...o, { kind: 'game' as const, week, winner: g.away, loser: g.home }],
    ])
  }
  if (!median) return out
  const half = Math.floor(teams.length / 2)
  const subsets: number[][] = []
  for (let mask = 0; mask < 1 << teams.length; mask++) {
    const s = teams.filter((_, i) => mask & (1 << i))
    if (s.length === half) subsets.push(s)
  }
  return out.flatMap((o) =>
    subsets.map((s) => [
      ...o,
      ...teams.map((id) => ({ kind: 'median' as const, week, rosterId: id, won: s.includes(id) })),
    ]),
  )
}

function truth(
  base: Parameters<typeof clinchStatuses>[0],
  fixed: WeekResult[],
  rosterId: number,
  goal: ScenarioGoal,
): boolean {
  const s = clinchStatuses({ ...base, fixed }).find((t) => t.rosterId === rosterId)
  if (!s) return false
  return goal === 'playoffs' ? s.clinchedPlayoffs : goal === 'bye' ? s.clinchedBye : s.eliminated
}

describe('clinchScenarios', () => {
  it('needs a win and a chaser loss when the two meet in the final week', () => {
    // Spots: 1. Team 1 at 8-2, team 2 at 7-3, one week left after this one.
    const teams = [team(1, 8, 2), team(2, 7, 3), team(3, 3, 7), team(4, 2, 8)]
    const schedule: ScheduledGame[] = [
      { week: 11, home: 1, away: 3 },
      { week: 11, home: 2, away: 4 },
      { week: 12, home: 1, away: 2 },
      { week: 12, home: 3, away: 4 },
    ]
    const res = clinchScenarios({
      teams,
      schedule,
      weeks: [11, 12],
      medianGame: false,
      spots: 1,
      byes: 0,
      week: 11,
    })
    const one = res.find((r) => r.rosterId === 1 && r.goal === 'playoffs')
    expect(one?.complete).toBe(true)
    // Teams 1 and 2 meet in week 12, so team 1 must be two wins clear after
    // week 11: a tie on wins is not enough.
    expect(one?.scenarios.map((s) => s.map(key))).toEqual([['g11:1>3', 'g11:4>2']])
    const two = res.find((r) => r.rosterId === 2 && r.goal === 'eliminated')
    expect(two?.scenarios.map((s) => s.map(key))).toEqual([['g11:4>2', 'g11:1>3']])
  })

  it('leaves out teams with nothing to decide this week', () => {
    const teams = [team(1, 10, 0), team(2, 0, 10)]
    const schedule: ScheduledGame[] = [{ week: 11, home: 1, away: 2 }]
    const res = clinchScenarios({
      teams,
      schedule,
      weeks: [11],
      medianGame: false,
      spots: 1,
      byes: 0,
      week: 11,
    })
    expect(res).toEqual([])
  })

  for (const median of [false, true]) {
    it(`matches every full week of results${median ? ' with the median game' : ''}`, () => {
      const random = mulberry32(median ? 7 : 3)
      const ids = [1, 2, 3, 4, 5, 6]
      const pairings: [number, number][][] = [
        [
          [1, 2],
          [3, 4],
          [5, 6],
        ],
        [
          [1, 3],
          [2, 5],
          [4, 6],
        ],
        [
          [1, 4],
          [2, 6],
          [3, 5],
        ],
      ]
      for (let trial = 0; trial < 12; trial++) {
        const played = 8
        const teams = ids.map((id) => {
          const w = Math.floor(random() * (played + 1))
          return team(id, w, played - w)
        })
        const weeks = [9, 10, 11]
        const schedule = weeks.flatMap((week, i) =>
          (pairings[i] ?? []).map(([home, away]) => ({ week, home, away })),
        )
        const base = { teams, schedule, weeks, medianGame: median, spots: 3, byes: 1 }
        const res = clinchScenarios({ ...base, week: 9 })
        const outcomes = allOutcomes(
          ids,
          schedule.filter((g) => g.week === 9),
          9,
          median,
        )
        const now = clinchStatuses(base)
        for (const id of ids) {
          const status = now.find((s) => s.rosterId === id)
          for (const goal of ['playoffs', 'bye', 'eliminated'] as const) {
            const already =
              status?.eliminated ||
              (goal === 'playoffs' && status?.clinchedPlayoffs) ||
              (goal === 'bye' && status?.clinchedBye) ||
              (goal === 'eliminated' && status?.clinchedPlayoffs)
            if (already) continue
            const entry = res.find((r) => r.rosterId === id && r.goal === goal)
            if (entry) expect(entry.complete).toBe(true)
            const sets = (entry?.scenarios ?? []).map((s) => s.map(key))
            for (const o of outcomes) {
              const keys = new Set(o.map(key))
              const predicted = sets.some((s) => s.every((k) => keys.has(k)))
              expect(predicted, `trial ${trial} team ${id} ${goal} ${[...keys].join(' ')}`).toBe(
                truth(base, o, id, goal),
              )
            }
          }
        }
      }
    })
  }
})

describe('scenarioChances', () => {
  it('turns scenarios into a chance from the week forecasts', () => {
    const entries = [
      {
        rosterId: 1,
        goal: 'playoffs' as const,
        complete: true,
        scenarios: [[{ kind: 'game' as const, week: 5, winner: 1, loser: 2 }]],
      },
    ]
    const forecasts = { '1:5': { mean: 100, sd: 0 }, '2:5': { mean: 90, sd: 0 } }
    const input = {
      week: 5,
      rosterIds: [1, 2],
      schedule: [{ week: 5, home: 1, away: 2 }],
      medianGame: false,
      forecasts,
      runs: 50,
      seed: 1,
    }
    expect(scenarioChances(entries, input)).toEqual([1])
    const even = scenarioChances(entries, {
      ...input,
      runs: 4000,
      forecasts: { '1:5': { mean: 100, sd: 20 }, '2:5': { mean: 100, sd: 20 } },
    })[0]
    expect(even).toBeGreaterThan(0.45)
    expect(even).toBeLessThan(0.55)
  })
})
