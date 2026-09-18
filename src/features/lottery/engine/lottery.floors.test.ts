import { runLottery, validateFloors } from './lottery.ts'
import { oddsForLeagueSize } from './odds.ts'
import type { LotteryConfig } from './types.ts'

const TIMESTAMP = '2026-07-18T00:00:00.000Z'

function makeConfig(teamCount: number, floors?: (number | null)[]): LotteryConfig {
  return {
    teams: Array.from({ length: teamCount }, (_, i) => ({ id: `team-${i + 1}`, seed: i + 1 })),
    oddsBps: oddsForLeagueSize(teamCount),
    floors,
  }
}

describe('pick floors', () => {
  test('a protected seed never falls below its floor across many trials', () => {
    // Seed 1 guaranteed top-4; seed 2 guaranteed top-6.
    const floors = [4, 6, ...new Array<null>(10).fill(null)]
    const config = makeConfig(12, floors)

    for (let seed = 1; seed <= 2000; seed++) {
      const { pickOrder } = runLottery(config, seed, TIMESTAMP)
      expect(pickOrder.indexOf('team-1') + 1).toBeLessThanOrEqual(4)
      expect(pickOrder.indexOf('team-2') + 1).toBeLessThanOrEqual(6)
    }
  })

  test('competing floors at the same pick are both honored', () => {
    // Two teams both guaranteed top-2: they must occupy picks 1 and 2.
    const floors = [2, 2, null, null]
    const config = makeConfig(4, floors)

    for (let seed = 1; seed <= 500; seed++) {
      const { pickOrder } = runLottery(config, seed, TIMESTAMP)
      expect(new Set([pickOrder[0], pickOrder[1]])).toEqual(new Set(['team-1', 'team-2']))
    }
  })

  test('unprotected teams can still win the top pick', () => {
    const floors = [3, null, null, null, null, null]
    const config = makeConfig(6, floors)
    const firstPickWinners = new Set<string>()
    for (let seed = 1; seed <= 2000; seed++) {
      firstPickWinners.add(runLottery(config, seed, TIMESTAMP).pickOrder[0] as string)
    }
    expect(firstPickWinners.size).toBeGreaterThan(1)
  })

  test('floors do not change results when absent', () => {
    const config = makeConfig(8)
    const withNullFloors = makeConfig(8, new Array<null>(8).fill(null))
    expect(runLottery(config, 77, TIMESTAMP).pickOrder).toEqual(
      runLottery(withNullFloors, 77, TIMESTAMP).pickOrder,
    )
  })

  test('rejects infeasible floors', () => {
    expect(() => runLottery(makeConfig(4, [1, 1, null, null]), 1, TIMESTAMP)).toThrow(/top-1/)
    expect(() => runLottery(makeConfig(4, [5, null, null, null]), 1, TIMESTAMP)).toThrow(
      /between 1 and 4/,
    )
    expect(() => runLottery(makeConfig(4, [2, 2]), 1, TIMESTAMP)).toThrow(/Floor count/)
  })
})

describe('validateFloors', () => {
  test('accepts satisfiable floors', () => {
    expect(validateFloors([4, 6, null, null], 12)).toBeNull()
    expect(validateFloors([2, 2, null, null], 4)).toBeNull()
  })

  test('rejects overbooked top picks with a clear message', () => {
    expect(validateFloors([2, 2, 2, null], 4)).toMatch(/3 teams.*top-2/)
  })

  test('rejects out-of-range floors', () => {
    expect(validateFloors([0, null], 2)).toMatch(/between 1 and 2/)
    expect(validateFloors([3, null], 2)).toMatch(/between 1 and 2/)
  })
})
