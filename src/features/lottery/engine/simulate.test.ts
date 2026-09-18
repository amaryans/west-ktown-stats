import { simulateDistribution } from './simulate.ts'
import { oddsForLeagueSize } from './odds.ts'
import type { LotteryConfig } from './types.ts'

function makeConfig(teamCount: number, floors?: (number | null)[]): LotteryConfig {
  return {
    teams: Array.from({ length: teamCount }, (_, i) => ({ id: `team-${i + 1}`, seed: i + 1 })),
    oddsBps: oddsForLeagueSize(teamCount),
    floors,
  }
}

describe('simulateDistribution', () => {
  test('is deterministic for the same base seed', () => {
    const config = makeConfig(6)
    const first = simulateDistribution(config, 500, 42)
    const second = simulateDistribution(config, 500, 42)
    expect(first.probabilities).toEqual(second.probabilities)
  })

  test('rows and columns each sum to 1', () => {
    const config = makeConfig(8)
    const { probabilities } = simulateDistribution(config, 2000, 7)
    for (const row of probabilities) {
      expect(row.reduce((sum, p) => sum + p, 0)).toBeCloseTo(1, 10)
    }
    for (let pick = 0; pick < 8; pick++) {
      const columnSum = probabilities.reduce((sum, row) => sum + (row[pick] ?? 0), 0)
      expect(columnSum).toBeCloseTo(1, 10)
    }
  })

  test('first-pick share tracks the odds table', () => {
    const config = makeConfig(10)
    const { probabilities } = simulateDistribution(config, 20_000, 99)
    config.oddsBps.forEach((bps, seedIndex) => {
      const expected = bps / 10000
      const observed = probabilities[seedIndex]?.[0] ?? 0
      const sigma = Math.sqrt((expected * (1 - expected)) / 20_000)
      expect(Math.abs(observed - expected)).toBeLessThanOrEqual(4 * sigma)
    })
  })

  test('respects pick floors — protected seed never lands past its floor', () => {
    const config = makeConfig(8, [3, null, null, null, null, null, null, null])
    const { probabilities } = simulateDistribution(config, 2000, 5)
    const protectedRow = probabilities[0] ?? []
    for (let pick = 3; pick < 8; pick++) {
      expect(protectedRow[pick]).toBe(0)
    }
  })

  test('rejects invalid trial counts', () => {
    expect(() => simulateDistribution(makeConfig(4), 0, 1)).toThrow(/positive integer/)
  })
})
