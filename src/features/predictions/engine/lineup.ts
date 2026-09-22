/**
 * Optimal lineup for a week: the assignment of rostered players to starting
 * slots that maximises projected points. Solved exactly (Hungarian algorithm)
 * because greedy filling goes wrong once a league has more than one flex.
 */
import type { Lineup, ProjectedPlayer, RosterInput, WeekProjections } from './types.ts'

/** Which player positions each Sleeper roster slot accepts. */
export const SLOT_ELIGIBILITY: Record<string, readonly string[]> = {
  QB: ['QB'],
  RB: ['RB'],
  WR: ['WR'],
  TE: ['TE'],
  K: ['K'],
  DEF: ['DEF'],
  FLEX: ['RB', 'WR', 'TE'],
  WRRB_FLEX: ['RB', 'WR'],
  REC_FLEX: ['WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  DL: ['DL', 'DE', 'DT'],
  LB: ['LB'],
  DB: ['DB', 'CB', 'S', 'SS', 'FS'],
  IDP_FLEX: ['DL', 'DE', 'DT', 'LB', 'DB', 'CB', 'S', 'SS', 'FS'],
}

/** Slots that never score. */
const NON_STARTING = new Set(['BN', 'IR', 'TAXI'])

export function startingSlots(rosterPositions: readonly string[]): string[] {
  return rosterPositions.filter((slot) => !NON_STARTING.has(slot))
}

export function slotAccepts(slot: string, positions: readonly string[]): boolean {
  const eligible = SLOT_ELIGIBILITY[slot] ?? [slot]
  return positions.some((p) => eligible.includes(p))
}

/**
 * Maximum-weight assignment of columns (players) to rows (slots) for a
 * rectangular cost matrix; returns the column chosen for each row (-1 = none).
 * Standard Hungarian algorithm with potentials, O(rows² · cols).
 */
export function assign(weights: number[][]): number[] {
  const n = weights.length
  const m = weights[0]?.length ?? 0
  if (n === 0 || m === 0) return new Array<number>(n).fill(-1)
  // Pad players with zero-weight dummies so every slot can be "filled".
  const width = Math.max(m, n)
  const cost = weights.map((row) => {
    const padded = new Array<number>(width).fill(0)
    row.forEach((w, j) => (padded[j] = -w))
    return padded
  })
  const u = new Array<number>(n + 1).fill(0)
  const v = new Array<number>(width + 1).fill(0)
  const p = new Array<number>(width + 1).fill(0)
  const way = new Array<number>(width + 1).fill(0)
  for (let i = 1; i <= n; i++) {
    p[0] = i
    let j0 = 0
    const minv = new Array<number>(width + 1).fill(Infinity)
    const used = new Array<boolean>(width + 1).fill(false)
    do {
      used[j0] = true
      const i0 = p[j0] as number
      let delta = Infinity
      let j1 = 0
      for (let j = 1; j <= width; j++) {
        if (used[j]) continue
        const cur = (cost[i0 - 1]?.[j - 1] ?? 0) - (u[i0] as number) - (v[j] as number)
        if (cur < (minv[j] as number)) {
          minv[j] = cur
          way[j] = j0
        }
        if ((minv[j] as number) < delta) {
          delta = minv[j] as number
          j1 = j
        }
      }
      for (let j = 0; j <= width; j++) {
        if (used[j]) {
          u[p[j] as number] = (u[p[j] as number] as number) + delta
          v[j] = (v[j] as number) - delta
        } else minv[j] = (minv[j] as number) - delta
      }
      j0 = j1
    } while (p[j0] !== 0)
    do {
      const j1 = way[j0] as number
      p[j0] = p[j1] as number
      j0 = j1
    } while (j0)
  }
  const result = new Array<number>(n).fill(-1)
  for (let j = 1; j <= width; j++) {
    const i = p[j] as number
    if (i > 0 && j <= m && (weights[i - 1]?.[j - 1] ?? -1) >= 0) result[i - 1] = j - 1
  }
  return result
}

export interface LineupInput {
  roster: RosterInput
  rosterPositions: readonly string[]
  projections: WeekProjections
  players: Record<string, ProjectedPlayer | undefined>
  /** NFL teams with no game this week (their players project to 0). */
  byeTeams: ReadonlySet<string>
}

/** Best starting lineup for one roster in one week. */
export function optimalLineup({
  roster,
  rosterPositions,
  projections,
  players,
  byeTeams,
}: LineupInput): Lineup {
  const slots = startingSlots(rosterPositions)
  const unavailable = new Set(roster.unavailable ?? [])
  const candidates = roster.players
    .filter((id) => !unavailable.has(id))
    .map((id) => {
      const player = players[id]
      const onBye = Boolean(player?.team && byeTeams.has(player.team))
      const points = onBye ? 0 : Math.max(0, projections[id] ?? 0)
      return { id, player, points, onBye }
    })
  const weights = slots.map((slot) =>
    candidates.map((c) =>
      c.player && slotAccepts(slot, c.player.positions) && c.points > 0 ? c.points : -1,
    ),
  )
  const chosen = assign(weights)
  const started = new Set<string>()
  const lineup = slots.map((slot, i) => {
    const j = chosen[i] ?? -1
    const c = j >= 0 ? candidates[j] : undefined
    if (c) started.add(c.id)
    return { slot, playerId: c?.id ?? null, points: c?.points ?? 0 }
  })
  const bench = candidates
    .filter((c) => !started.has(c.id))
    .map((c) => ({ playerId: c.id, points: c.points, onBye: c.onBye }))
    .sort((a, b) => b.points - a.points)
  return {
    slots: lineup,
    bench,
    total: round2(lineup.reduce((sum, s) => sum + s.points, 0)),
    emptySlots: lineup.filter((s) => s.playerId === null).length,
    byes: candidates.filter((c) => c.onBye).map((c) => c.id),
  }
}

/**
 * NFL teams on bye this week, inferred from the projections: a team whose
 * players all project to nothing has no game.
 */
export function inferByeTeams(
  projections: WeekProjections,
  players: Record<string, ProjectedPlayer | undefined>,
  allTeams: Iterable<string>,
): Set<string> {
  const active = new Set<string>()
  for (const [id, points] of Object.entries(projections)) {
    const team = players[id]?.team
    if (team && points > 0) active.add(team)
  }
  const byes = new Set<string>()
  for (const team of allTeams) if (!active.has(team)) byes.add(team)
  return byes
}

export function round2(x: number): number {
  return Math.round(x * 100) / 100
}
