import { runLottery } from './lottery.ts'
import type { LotteryConfig } from './types.ts'

const SIMULATION_TIMESTAMP = 'simulation'

export interface SimulationResult {
  trials: number
  /**
   * probabilities[seedIndex][pickIndex] = share of trials in which the team at
   * that seed landed that pick (0..1). Rows follow config.teams order.
   */
  probabilities: number[][]
}

/**
 * Estimate each seed's pick distribution by running many seeded lotteries.
 * Deterministic for a given (config, trials, baseSeed) — rerunning with the
 * same base seed reproduces the exact same table.
 */
export function simulateDistribution(
  config: LotteryConfig,
  trials: number,
  baseSeed: number,
): SimulationResult {
  if (!Number.isInteger(trials) || trials <= 0) {
    throw new Error('Trials must be a positive integer')
  }
  const teamCount = config.teams.length
  const indexById = new Map(config.teams.map((team, index) => [team.id, index]))
  const counts = Array.from({ length: teamCount }, () => new Array<number>(teamCount).fill(0))

  for (let trial = 0; trial < trials; trial++) {
    // Mix the trial number into the seed; >>> 0 keeps it a valid uint32.
    const seed = (baseSeed + trial * 2654435761) >>> 0
    const { pickOrder } = runLottery(config, seed, SIMULATION_TIMESTAMP)
    pickOrder.forEach((teamId, pickIndex) => {
      const seedIndex = indexById.get(teamId)
      const row = seedIndex !== undefined ? counts[seedIndex] : undefined
      if (row !== undefined) {
        row[pickIndex] = (row[pickIndex] ?? 0) + 1
      }
    })
  }

  return {
    trials,
    probabilities: counts.map((row) => row.map((count) => count / trials)),
  }
}
