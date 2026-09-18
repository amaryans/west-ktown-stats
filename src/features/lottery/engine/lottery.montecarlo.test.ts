import { runLottery } from './lottery.ts'
import { oddsForLeagueSize } from './odds.ts'
import type { LotteryConfig } from './types.ts'

const TIMESTAMP = '2026-07-18T00:00:00.000Z'
const TRIALS = 100_000
/** 4-sigma binomial bound: deterministic seeded trials make this stable, not flaky. */
const SIGMAS = 4

function makeConfig(teamCount: number): LotteryConfig {
  return {
    teams: Array.from({ length: teamCount }, (_, i) => ({ id: `team-${i + 1}`, seed: i + 1 })),
    oddsBps: oddsForLeagueSize(teamCount),
  }
}

describe('Monte Carlo odds validation', () => {
  test.each([8, 10, 12, 14])(
    'first-pick frequencies match the odds table for %i teams',
    (teamCount) => {
      // Arrange
      const config = makeConfig(teamCount)
      const firstPickCounts = new Map<string, number>()

      // Act — trials are seeded 1..TRIALS, so results are fully deterministic
      for (let seed = 1; seed <= TRIALS; seed++) {
        const winner = runLottery(config, seed, TIMESTAMP).pickOrder[0] as string
        firstPickCounts.set(winner, (firstPickCounts.get(winner) ?? 0) + 1)
      }

      // Assert — each observed frequency within 4 sigma of its expected probability
      config.teams.forEach((team, index) => {
        const expected = (config.oddsBps[index] as number) / 10000
        const observed = (firstPickCounts.get(team.id) ?? 0) / TRIALS
        const sigma = Math.sqrt((expected * (1 - expected)) / TRIALS)
        expect(Math.abs(observed - expected)).toBeLessThanOrEqual(SIGMAS * sigma)
      })
    },
  )

  test('full ordering distribution matches closed form for a 3-team league', () => {
    // Arrange — weights 50% / 30% / 20%; every ordering probability is computable
    // by hand for successive draws without replacement, e.g.
    // P(A,B,C) = 0.5 * (0.3 / 0.5) = 0.30
    const config: LotteryConfig = {
      teams: [
        { id: 'A', seed: 1 },
        { id: 'B', seed: 2 },
        { id: 'C', seed: 3 },
      ],
      oddsBps: [5000, 3000, 2000],
    }
    const closedForm = new Map<string, number>([
      ['A,B,C', 0.5 * (0.3 / 0.5)],
      ['A,C,B', 0.5 * (0.2 / 0.5)],
      ['B,A,C', 0.3 * (0.5 / 0.7)],
      ['B,C,A', 0.3 * (0.2 / 0.7)],
      ['C,A,B', 0.2 * (0.5 / 0.8)],
      ['C,B,A', 0.2 * (0.3 / 0.8)],
    ])

    // Act
    const observedCounts = new Map<string, number>()
    for (let seed = 1; seed <= TRIALS; seed++) {
      const key = runLottery(config, seed, TIMESTAMP).pickOrder.join(',')
      observedCounts.set(key, (observedCounts.get(key) ?? 0) + 1)
    }

    // Assert
    let probabilitySum = 0
    for (const [ordering, expected] of closedForm) {
      probabilitySum += expected
      const observed = (observedCounts.get(ordering) ?? 0) / TRIALS
      const sigma = Math.sqrt((expected * (1 - expected)) / TRIALS)
      expect(Math.abs(observed - expected)).toBeLessThanOrEqual(SIGMAS * sigma)
    }
    expect(probabilitySum).toBeCloseTo(1, 10)
  })

  test('mean pick position is monotone in seed for 14 teams', () => {
    // Better seeds (worse teams) should on average pick earlier.
    const config = makeConfig(14)
    const positionSums = new Map<string, number>()
    const trials = 20_000

    for (let seed = 1; seed <= trials; seed++) {
      runLottery(config, seed, TIMESTAMP).pickOrder.forEach((id, position) => {
        positionSums.set(id, (positionSums.get(id) ?? 0) + position)
      })
    }

    const meanPositions = config.teams.map((team) => (positionSums.get(team.id) ?? 0) / trials)
    for (let i = 1; i < meanPositions.length; i++) {
      // Seeds with identical odds (e.g. seeds 1-3 at 1400 bps) have statistically
      // equal means — only require a strict increase where the odds actually drop.
      if ((config.oddsBps[i] as number) < (config.oddsBps[i - 1] as number)) {
        expect(meanPositions[i]).toBeGreaterThan(meanPositions[i - 1] as number)
      }
    }
  })
})
