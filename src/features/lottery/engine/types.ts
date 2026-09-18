export interface LotteryTeam {
  /** Stable team identifier (Sleeper roster_id or a generated id for manual leagues). */
  id: string
  /** 1 = worst team = best odds. Teams must be provided sorted by seed ascending. */
  seed: number
}

export interface LotteryConfig {
  teams: LotteryTeam[]
  /** Odds in basis points per seed position; must sum to exactly 10000. */
  oddsBps: number[]
  /**
   * Optional per-seed pick floor: the worst pick that seed can receive
   * (e.g. 4 = guaranteed a top-4 pick). Null entries are unprotected.
   */
  floors?: (number | null)[]
}

export interface LotteryResult {
  /** RNG seed used — replaying with the same config reproduces pickOrder exactly. */
  seedUsed: number
  /** Team ids; index 0 is the #1 pick. */
  pickOrder: string[]
  /** ISO timestamp supplied by the caller (the engine itself never reads the clock). */
  timestamp: string
}
