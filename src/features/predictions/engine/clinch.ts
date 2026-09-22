/**
 * Clinch and elimination, decided exactly rather than by simulation. A team
 * has clinched when no combination of remaining results can leave it outside
 * the playoff spots on wins alone (a tie on wins is treated as lost, since
 * points for is unknowable in advance), and is eliminated when even winning
 * out cannot get it in. Each question is a small max-flow feasibility check
 * over the remaining games, in the spirit of the classic baseball-elimination
 * argument, extended to several playoff spots and to the league-median game.
 */
import type { RecordInput, ScheduledGame } from './types.ts'

export interface ClinchInput {
  teams: readonly RecordInput[]
  /** Remaining head-to-head games. */
  schedule: readonly ScheduledGame[]
  /** Remaining weeks (each adds a median game when the league plays one). */
  weeks: readonly number[]
  medianGame: boolean
  /** Playoff spots. */
  spots: number
  /** First-round byes (0 when the bracket has none). */
  byes: number
}

export interface ClinchStatus {
  rosterId: number
  remainingGames: number
  clinchedPlayoffs: boolean
  clinchedBye: boolean
  eliminated: boolean
  /**
   * Wins (or losses by the team it must beat out) that guarantee a playoff
   * spot; 0 once clinched, null when eliminated.
   */
  magicNumber: number | null
  /** Losses (or wins by the chasing pack) that end the season; null once clinched or eliminated. */
  eliminationNumber: number | null
}

// ---- max flow -----------------------------------------------------------

interface Edge {
  to: number
  cap: number
  rev: number
}

class Flow {
  readonly adj: Edge[][]
  constructor(n: number) {
    this.adj = Array.from({ length: n }, () => [])
  }
  add(from: number, to: number, cap: number): void {
    const a = this.adj[from] as Edge[]
    const b = this.adj[to] as Edge[]
    a.push({ to, cap, rev: b.length })
    b.push({ to: from, cap: 0, rev: a.length - 1 })
  }
  /** Edmonds–Karp; the graphs here have a few hundred edges at most. */
  maxFlow(source: number, sink: number): number {
    let total = 0
    for (;;) {
      const parent = new Array<{ node: number; edge: number } | null>(this.adj.length).fill(null)
      const queue = [source]
      const seen = new Set([source])
      while (queue.length && !seen.has(sink)) {
        const u = queue.shift() as number
        const edges = this.adj[u] as Edge[]
        for (let i = 0; i < edges.length; i++) {
          const e = edges[i] as Edge
          if (e.cap > 0 && !seen.has(e.to)) {
            seen.add(e.to)
            parent[e.to] = { node: u, edge: i }
            queue.push(e.to)
          }
        }
      }
      if (!seen.has(sink)) return total
      let push = Infinity
      for (let v = sink; v !== source;) {
        const p = parent[v] as { node: number; edge: number }
        push = Math.min(push, ((this.adj[p.node] as Edge[])[p.edge] as Edge).cap)
        v = p.node
      }
      for (let v = sink; v !== source;) {
        const p = parent[v] as { node: number; edge: number }
        const e = (this.adj[p.node] as Edge[])[p.edge] as Edge
        e.cap -= push
        ;((this.adj[e.to] as Edge[])[e.rev] as Edge).cap += push
        v = p.node
      }
      total += push
    }
  }
}

// ---- helpers ------------------------------------------------------------

/** Standings points: a win is 2, a tie 1, so ties stay integers. */
function points(t: RecordInput): number {
  return 2 * t.wins + t.ties
}

function* combinations<T>(items: readonly T[], k: number): Generator<T[]> {
  if (k === 0) {
    yield []
    return
  }
  if (items.length < k) return
  const [head, ...rest] = items as [T, ...T[]]
  for (const c of combinations(rest, k - 1)) yield [head, ...c]
  yield* combinations(rest, k)
}

interface Context {
  teams: readonly RecordInput[]
  schedule: readonly ScheduledGame[]
  weeks: number
  medianGame: boolean
  /** Teams that can be above the median in one week. */
  medianWinners: number
  gamesLeft: Map<number, number>
}

/**
 * Can every team in `needy` still reach `target` points, all at once, with
 * the results of every other team chosen to help them? Each needy team's
 * deficit must be covered by games it can win (a game between two needy
 * teams helps only one) and by median games (limited per week).
 */
function canAllReach(ctx: Context, needy: readonly number[], target: number): boolean {
  const byId = new Map(ctx.teams.map((t) => [t.rosterId, t]))
  const need = new Map<number, number>()
  for (const id of needy) {
    const t = byId.get(id)
    if (!t) return false
    need.set(id, Math.max(0, Math.ceil((target - points(t)) / 2)))
  }
  const games = ctx.schedule.filter((g) => need.has(g.home) || need.has(g.away))
  const weekNodes = ctx.medianGame ? ctx.weeks : 0
  const source = 0
  const sink = 1
  const teamNode = new Map<number, number>()
  let n = 2
  for (const id of needy) teamNode.set(id, n++)
  const flow = new Flow(n + games.length + weekNodes)
  let required = 0
  for (const [id, d] of need) {
    flow.add(teamNode.get(id) as number, sink, d)
    required += d
  }
  if (required === 0) return true
  games.forEach((g, i) => {
    const node = n + i
    flow.add(source, node, 1)
    for (const side of [g.home, g.away]) {
      const t = teamNode.get(side)
      if (t !== undefined) flow.add(node, t, 1)
    }
  })
  for (let w = 0; w < weekNodes; w++) {
    const node = n + games.length + w
    flow.add(source, node, Math.min(needy.length, ctx.medianWinners))
    for (const id of needy) flow.add(node, teamNode.get(id) as number, 1)
  }
  return flow.maxFlow(source, sink) === required
}

/**
 * Can every team in `capped` finish with at most `limit` points while the
 * remaining games are played out? Games between two capped teams must hand
 * a win to one of them, and each week some median wins have to land on
 * capped teams once the uncapped ones have taken theirs.
 */
function canAllStayUnder(
  ctx: Context,
  capped: readonly number[],
  limit: number,
  forcedMedianPerWeek: number,
): boolean {
  const byId = new Map(ctx.teams.map((t) => [t.rosterId, t]))
  const room = new Map<number, number>()
  for (const id of capped) {
    const t = byId.get(id)
    if (!t) return false
    const r = Math.floor((limit - points(t)) / 2)
    if (r < 0) return false
    room.set(id, r)
  }
  const games = ctx.schedule.filter((g) => room.has(g.home) && room.has(g.away))
  const weekNodes = ctx.medianGame && forcedMedianPerWeek > 0 ? ctx.weeks : 0
  const required = games.length + weekNodes * forcedMedianPerWeek
  if (required === 0) return true
  const source = 0
  const sink = 1
  const teamNode = new Map<number, number>()
  let n = 2
  for (const id of capped) teamNode.set(id, n++)
  const flow = new Flow(n + games.length + weekNodes)
  for (const [id, r] of room) flow.add(teamNode.get(id) as number, sink, r)
  games.forEach((g, i) => {
    const node = n + i
    flow.add(source, node, 1)
    flow.add(node, teamNode.get(g.home) as number, 1)
    flow.add(node, teamNode.get(g.away) as number, 1)
  })
  for (let w = 0; w < weekNodes; w++) {
    const node = n + games.length + w
    flow.add(source, node, forcedMedianPerWeek)
    for (const id of capped) flow.add(node, teamNode.get(id) as number, 1)
  }
  return flow.maxFlow(source, sink) === required
}

/** True when `spots` other teams can all finish with at least the team's current points. */
function hasClinched(ctx: Context, team: RecordInput, spots: number): boolean {
  if (spots <= 0) return false
  const target = points(team)
  const others = ctx.teams.filter((t) => t.rosterId !== team.rosterId)
  if (others.length < spots) return true
  const already = others.filter((t) => points(t) >= target)
  if (already.length >= spots) return false
  const candidates = others.filter(
    (t) => points(t) < target && points(t) + 2 * (ctx.gamesLeft.get(t.rosterId) ?? 0) >= target,
  )
  const needed = spots - already.length
  if (candidates.length < needed) return true
  for (const subset of combinations(candidates, needed)) {
    if (
      canAllReach(
        ctx,
        subset.map((t) => t.rosterId),
        target,
      )
    )
      return false
  }
  return true
}

/** True when, even winning out, at least `spots` other teams must finish above the team. */
function isEliminated(ctx: Context, team: RecordInput, spots: number): boolean {
  const best = points(team) + 2 * (ctx.gamesLeft.get(team.rosterId) ?? 0)
  const others = ctx.teams.filter((t) => t.rosterId !== team.rosterId)
  const above = others.filter((t) => points(t) > best)
  if (above.length >= spots) return true
  const rest = others.filter((t) => points(t) <= best)
  const free = spots - 1 - above.length // more teams allowed to finish above
  if (free >= rest.length) return false
  // The team itself and the `spots - 1` uncapped teams soak up median wins first.
  const forced = Math.max(0, ctx.medianWinners - spots)
  for (const uncapped of combinations(rest, free)) {
    const skip = new Set(uncapped.map((t) => t.rosterId))
    const capped = rest.filter((t) => !skip.has(t.rosterId)).map((t) => t.rosterId)
    if (canAllStayUnder(ctx, capped, best, forced)) return false
  }
  return true
}

export function clinchStatuses(input: ClinchInput): ClinchStatus[] {
  const gamesLeft = new Map<number, number>()
  for (const t of input.teams) gamesLeft.set(t.rosterId, input.medianGame ? input.weeks.length : 0)
  for (const g of input.schedule) {
    gamesLeft.set(g.home, (gamesLeft.get(g.home) ?? 0) + 1)
    gamesLeft.set(g.away, (gamesLeft.get(g.away) ?? 0) + 1)
  }
  const ctx: Context = {
    teams: input.teams,
    schedule: input.schedule,
    weeks: input.weeks.length,
    medianGame: input.medianGame,
    medianWinners: Math.floor(input.teams.length / 2),
    gamesLeft,
  }
  const spots = Math.min(input.spots, input.teams.length)
  return input.teams.map((team) => {
    const remaining = gamesLeft.get(team.rosterId) ?? 0
    const others = input.teams.filter((t) => t.rosterId !== team.rosterId)
    const maxOthers = others
      .map((t) => points(t) + 2 * (gamesLeft.get(t.rosterId) ?? 0))
      .sort((a, b) => b - a)
    const minOthers = others.map(points).sort((a, b) => b - a)
    const clinched = hasClinched(ctx, team, spots)
    const eliminated = !clinched && isEliminated(ctx, team, spots)
    // Beat the best possible finish of the team that would take the last spot.
    const rivalMax = maxOthers[spots - 1]
    const magic = clinched
      ? 0
      : rivalMax === undefined
        ? 0
        : Math.max(0, Math.floor((rivalMax - points(team)) / 2) + 1)
    // Fall below the current points of the team holding the last spot.
    const holder = minOthers[spots - 1]
    const best = points(team) + 2 * remaining
    const elimination =
      holder === undefined ? null : Math.max(0, Math.floor((best - holder) / 2) + 1)
    return {
      rosterId: team.rosterId,
      remainingGames: remaining,
      clinchedPlayoffs: clinched,
      clinchedBye: input.byes > 0 && hasClinched(ctx, team, Math.min(input.byes, spots)),
      eliminated,
      magicNumber: eliminated ? null : magic,
      eliminationNumber: clinched || eliminated ? null : elimination,
    }
  })
}
