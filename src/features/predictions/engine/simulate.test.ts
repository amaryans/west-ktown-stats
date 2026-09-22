import { describe, expect, it } from 'vitest'
import { forecastKey } from './forecast.ts'
import { byeCount, simulateSeason, winProbability } from './simulate.ts'
import type { SimulationInput } from './types.ts'

function base(overrides: Partial<SimulationInput> = {}): SimulationInput {
  return {
    teams: [
      { rosterId: 1, wins: 3, losses: 0, ties: 0, pointsFor: 400 },
      { rosterId: 2, wins: 2, losses: 1, ties: 0, pointsFor: 350 },
      { rosterId: 3, wins: 1, losses: 2, ties: 0, pointsFor: 300 },
      { rosterId: 4, wins: 0, losses: 3, ties: 0, pointsFor: 250 },
    ],
    schedule: [
      { week: 4, home: 1, away: 2 },
      { week: 4, home: 3, away: 4 },
    ],
    weeks: [4],
    forecasts: {
      [forecastKey(1, 4)]: { mean: 120, sd: 20 },
      [forecastKey(2, 4)]: { mean: 110, sd: 20 },
      [forecastKey(3, 4)]: { mean: 100, sd: 20 },
      [forecastKey(4, 4)]: { mean: 90, sd: 20 },
    },
    playoffTeams: 2,
    medianGame: false,
    runs: 2000,
    seed: 7,
    ...overrides,
  }
}

describe('byeCount', () => {
  it('fills the bracket up to a power of two', () => {
    expect(byeCount(6)).toBe(2)
    expect(byeCount(4)).toBe(0)
    expect(byeCount(5)).toBe(3)
    expect(byeCount(7)).toBe(1)
    expect(byeCount(8)).toBe(0)
    expect(byeCount(1)).toBe(0)
  })
})

describe('simulateSeason', () => {
  it('is deterministic for a seed and sums seed odds to one', () => {
    const a = simulateSeason(base())
    const b = simulateSeason(base())
    expect(a).toEqual(b)
    for (const t of a.teams) {
      expect(t.seedDistribution.reduce((s, p) => s + p, 0)).toBeCloseTo(1)
      expect(t.projectedWins + t.projectedLosses + t.projectedTies).toBeCloseTo(4)
    }
  })

  it('locks in a team that cannot be caught and buries one that cannot catch up', () => {
    const r = simulateSeason(base())
    const one = r.teams.find((t) => t.rosterId === 1)
    const four = r.teams.find((t) => t.rosterId === 4)
    // 3-0 with the most points: 3-1 at worst still beats every 2-2 team.
    expect(one?.playoff).toBe(1)
    expect(one?.topSeed).toBeGreaterThan(0.5)
    // 0-3 can only reach 1-3 while both 2-1 and 3-0 stay ahead.
    expect(four?.playoff).toBe(0)
    expect(four?.averageSeed).toBeGreaterThan(3)
  })

  it('breaks record ties on points for', () => {
    const r = simulateSeason(
      base({
        teams: [
          { rosterId: 1, wins: 2, losses: 1, ties: 0, pointsFor: 400 },
          { rosterId: 2, wins: 2, losses: 1, ties: 0, pointsFor: 200 },
          { rosterId: 3, wins: 0, losses: 3, ties: 0, pointsFor: 300 },
          { rosterId: 4, wins: 0, losses: 3, ties: 0, pointsFor: 250 },
        ],
        schedule: [
          { week: 4, home: 1, away: 3 },
          { week: 4, home: 2, away: 4 },
        ],
        forecasts: {
          [forecastKey(1, 4)]: { mean: 100, sd: 0 },
          [forecastKey(2, 4)]: { mean: 100, sd: 0 },
          [forecastKey(3, 4)]: { mean: 100, sd: 0 },
          [forecastKey(4, 4)]: { mean: 100, sd: 0 },
        },
        playoffTeams: 1,
        runs: 10,
      }),
    )
    // All four games tie, so records stay tied and points for decides seed 1.
    expect(r.teams.find((t) => t.rosterId === 1)?.topSeed).toBe(1)
    expect(r.teams.find((t) => t.rosterId === 2)?.seedDistribution[1]).toBe(1)
  })

  it('adds a median game each week when the league plays one', () => {
    const r = simulateSeason(base({ medianGame: true, runs: 50 }))
    for (const t of r.teams) {
      // Three played + one head-to-head + one median game.
      expect(t.projectedWins + t.projectedLosses + t.projectedTies).toBeCloseTo(5)
    }
  })

  it('reports byes for a six-team bracket', () => {
    const r = simulateSeason(base({ playoffTeams: 6, runs: 100 }))
    // Only four teams, so the bracket shrinks to four and has no byes.
    expect(r.playoffTeams).toBe(4)
    expect(r.byes).toBe(0)
    expect(r.teams.every((t) => t.playoff === 1)).toBe(true)
  })
})

describe('six-team playoffs', () => {
  it('gives byes to the top two seeds and crowns a champion in the third round', () => {
    const teams = Array.from({ length: 10 }, (_, i) => ({
      rosterId: i + 1,
      wins: 10 - i,
      losses: i,
      ties: 0,
      pointsFor: 1500 - i * 10,
    }))
    const forecasts: SimulationInput['forecasts'] = {}
    for (const t of teams)
      for (const week of [15, 16, 17])
        forecasts[forecastKey(t.rosterId, week)] = { mean: 120 - t.rosterId, sd: 15 }
    const r = simulateSeason({
      teams,
      schedule: [],
      weeks: [],
      forecasts,
      playoffTeams: 6,
      medianGame: false,
      runs: 400,
      seed: 3,
      playoffs: { rounds: [[15], [16], [17]], reseed: false },
    })
    expect(r.byes).toBe(2)
    expect(r.rounds).toBe(3)
    const byId = new Map(r.teams.map((t) => [t.rosterId, t]))
    expect(byId.get(1)?.bye).toBe(1)
    expect(byId.get(2)?.bye).toBe(1)
    expect(byId.get(3)?.bye).toBe(0)
    expect(byId.get(7)?.playoff).toBe(0)
    expect(byId.get(7)?.champion).toBe(0)
    // Seeds 1 and 2 skip round one, so they reach at least the semifinal every time.
    expect(byId.get(1)?.semifinal).toBe(1)
    expect(byId.get(2)?.semifinal).toBe(1)
    expect(r.teams.reduce((sum, t) => sum + t.champion, 0)).toBeCloseTo(1)
    expect(r.teams.reduce((sum, t) => sum + t.final, 0)).toBeCloseTo(2)
  })
})

describe('winProbability', () => {
  it('is symmetric and favours the higher mean', () => {
    const a = { mean: 120, sd: 20 }
    const b = { mean: 100, sd: 20 }
    const p = winProbability(a, b)
    expect(p).toBeGreaterThan(0.7)
    expect(p + winProbability(b, a)).toBeCloseTo(1)
    expect(winProbability(a, a)).toBeCloseTo(0.5)
    expect(winProbability({ mean: 1, sd: 0 }, { mean: 0, sd: 0 })).toBe(1)
  })
})
