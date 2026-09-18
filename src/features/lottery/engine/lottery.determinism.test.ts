import { replayLottery, runLottery } from './lottery.ts'
import { oddsForLeagueSize } from './odds.ts'
import type { LotteryConfig } from './types.ts'

const TIMESTAMP = '2026-07-18T00:00:00.000Z'

function makeConfig(teamCount: number): LotteryConfig {
  return {
    teams: Array.from({ length: teamCount }, (_, i) => ({ id: `team-${i + 1}`, seed: i + 1 })),
    oddsBps: oddsForLeagueSize(teamCount),
  }
}

describe('runLottery determinism', () => {
  test('same config and seed produce identical pick orders', () => {
    const config = makeConfig(14)
    const first = runLottery(config, 123456789, TIMESTAMP)
    const second = runLottery(config, 123456789, TIMESTAMP)
    expect(first.pickOrder).toEqual(second.pickOrder)
  })

  test('different seeds produce different pick orders', () => {
    const config = makeConfig(14)
    const orders = new Set(
      Array.from({ length: 20 }, (_, seed) =>
        runLottery(config, seed + 1, TIMESTAMP).pickOrder.join(','),
      ),
    )
    // 20 random orderings of 14 teams colliding is astronomically unlikely.
    expect(orders.size).toBeGreaterThan(15)
  })

  test('every team appears exactly once in the pick order', () => {
    const config = makeConfig(12)
    const result = runLottery(config, 42, TIMESTAMP)
    expect([...result.pickOrder].sort()).toEqual(config.teams.map((t) => t.id).sort())
  })

  test('replayLottery verifies a stored result', () => {
    const config = makeConfig(10)
    const result = runLottery(config, 987654321, TIMESTAMP)
    expect(replayLottery(config, result)).toBe(true)
    const tampered = { ...result, pickOrder: [...result.pickOrder].reverse() }
    expect(replayLottery(config, tampered)).toBe(false)
  })
})

describe('runLottery validation', () => {
  test('throws when team and odds counts differ', () => {
    const config = { teams: makeConfig(10).teams, oddsBps: oddsForLeagueSize(12) }
    expect(() => runLottery(config, 1, TIMESTAMP)).toThrow(/must match/)
  })

  test('throws when odds do not sum to 10000', () => {
    const teams = makeConfig(3).teams
    expect(() => runLottery({ teams, oddsBps: [5000, 3000, 1999] }, 1, TIMESTAMP)).toThrow(
      /sum to exactly 10000/,
    )
  })

  test('throws for non-integer or non-positive odds', () => {
    const teams = makeConfig(2).teams
    expect(() => runLottery({ teams, oddsBps: [9999.5, 0.5] }, 1, TIMESTAMP)).toThrow(
      /positive integers/,
    )
  })

  test('throws for duplicate team ids', () => {
    const config = {
      teams: [
        { id: 'dup', seed: 1 },
        { id: 'dup', seed: 2 },
      ],
      oddsBps: [6000, 4000],
    }
    expect(() => runLottery(config, 1, TIMESTAMP)).toThrow(/unique/)
  })

  test('throws for an empty league', () => {
    expect(() => runLottery({ teams: [], oddsBps: [] }, 1, TIMESTAMP)).toThrow(/at least one/)
  })
})
