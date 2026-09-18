import { mulberry32 } from './rng.ts'
import type { LotteryConfig, LotteryResult } from './types.ts'

const BPS_TOTAL = 10000

interface RemainingTeam {
  id: string
  weight: number
  /** Worst allowed pick (1-based), or null when unprotected. */
  floor: number | null
}

/**
 * Run the draft lottery: successive weighted draws without replacement over
 * each team's odds. Mathematically equivalent to the NBA's physical 4-ball
 * combination process, but exact at any league size.
 *
 * Optional per-seed pick floors ("never picks below spot F") are honored by
 * restricting each draw to the tightest set of protected teams whose floors
 * would otherwise become unsatisfiable — the same mechanism as the NBA's rule
 * that the worst team can never fall past a fixed pick.
 *
 * Every pick 1..N is drawn by lottery. Deterministic for a given (config, seed):
 * replaying with the same inputs reproduces the identical pick order.
 */
export function runLottery(config: LotteryConfig, seed: number, timestamp: string): LotteryResult {
  validateConfig(config)
  const rng = mulberry32(seed)

  let remaining: RemainingTeam[] = config.teams.map((team, index) => ({
    id: team.id,
    weight: config.oddsBps[index] ?? 0,
    floor: config.floors?.[index] ?? null,
  }))
  const pickOrder: string[] = []

  while (remaining.length > 0) {
    const pickNumber = pickOrder.length + 1
    const pool = drawPool(remaining, pickNumber)
    const totalWeight = pool.reduce((sum, entry) => sum + entry.weight, 0)
    const roll = rng() * totalWeight

    let cumulative = 0
    let winner = pool[pool.length - 1] // guards against float edge where roll === totalWeight
    for (const entry of pool) {
      cumulative += entry.weight
      if (roll < cumulative) {
        winner = entry
        break
      }
    }

    if (winner === undefined) {
      throw new Error('Lottery draw failed to select a winner') // unreachable
    }
    const winnerId = winner.id
    pickOrder.push(winnerId)
    remaining = remaining.filter((entry) => entry.id !== winnerId)
  }

  return { seedUsed: seed, pickOrder, timestamp }
}

/**
 * The set of teams eligible for this pick. If some group of protected teams
 * exactly fills the picks from here to a horizon p (a "tight set" in Hall's
 * theorem terms), the draw must come from that group or a floor would break.
 */
function drawPool(remaining: RemainingTeam[], pickNumber: number): RemainingTeam[] {
  const lastPick = pickNumber + remaining.length - 1
  for (let horizon = pickNumber; horizon <= lastPick; horizon++) {
    const constrained = remaining.filter((team) => team.floor !== null && team.floor <= horizon)
    if (constrained.length >= horizon - pickNumber + 1) {
      return constrained
    }
  }
  return remaining
}

/** Re-run a past lottery from its stored seed — lets anyone verify a result. */
export function replayLottery(config: LotteryConfig, result: LotteryResult): boolean {
  const replayed = runLottery(config, result.seedUsed, result.timestamp)
  return (
    replayed.pickOrder.length === result.pickOrder.length &&
    replayed.pickOrder.every((id, i) => id === result.pickOrder[i])
  )
}

/**
 * Check that pick floors are satisfiable: no more than K teams may demand a
 * pick within the first K slots (Hall's condition). Returns a user-facing
 * message for the first violation, or null when valid.
 */
export function validateFloors(
  floors: readonly (number | null)[],
  teamCount: number,
): string | null {
  for (const floor of floors) {
    if (floor !== null && (!Number.isInteger(floor) || floor < 1 || floor > teamCount)) {
      return `Floors must be between 1 and ${teamCount}`
    }
  }
  for (let k = 1; k <= teamCount; k++) {
    const demand = floors.filter((floor) => floor !== null && floor <= k).length
    if (demand > k) {
      return `${demand} teams are guaranteed a top-${k} pick, but there are only ${k} such picks`
    }
  }
  return null
}

function validateConfig(config: LotteryConfig): void {
  const { teams, oddsBps, floors } = config
  if (teams.length === 0) {
    throw new Error('Lottery config must contain at least one team')
  }
  if (teams.length !== oddsBps.length) {
    throw new Error(`Team count (${teams.length}) must match odds count (${oddsBps.length})`)
  }
  if (oddsBps.some((bps) => !Number.isInteger(bps) || bps <= 0)) {
    throw new Error('All odds must be positive integers (basis points)')
  }
  const total = oddsBps.reduce((sum, bps) => sum + bps, 0)
  if (total !== BPS_TOTAL) {
    throw new Error(`Odds must sum to exactly ${BPS_TOTAL} bps, got ${total}`)
  }
  const ids = new Set(teams.map((team) => team.id))
  if (ids.size !== teams.length) {
    throw new Error('Team ids must be unique')
  }
  if (floors !== undefined) {
    if (floors.length !== teams.length) {
      throw new Error(`Floor count (${floors.length}) must match team count (${teams.length})`)
    }
    const floorError = validateFloors(floors, teams.length)
    if (floorError !== null) {
      throw new Error(floorError)
    }
  }
}
