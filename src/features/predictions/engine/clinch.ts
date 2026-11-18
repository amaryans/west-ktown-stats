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
  /** Results to treat as already played (a what-if); their games leave the schedule. */
  fixed?: readonly WeekResult[]
}

/** One result in a remaining week: a head-to-head game or a team's median game. */
export type WeekResult =
  | { kind: 'game'; week: number; winner: number; loser: number }
  | { kind: 'median'; week: number; rosterId: number; won: boolean }

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
export function points(t: RecordInput): number {
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

/** The league-median game of one remaining week. */
interface MedianWeek {
  week: number
  /** Median wins still to hand out among `eligible`. */
  capacity: number
  /** Teams whose median result that week is not yet decided. */
  eligible: Set<number>
}

export interface Context {
  teams: readonly RecordInput[]
  schedule: readonly ScheduledGame[]
  median: readonly MedianWeek[]
  gamesLeft: Map<number, number>
}

/**
 * The standings after `fixed` results, with those games taken off the
 * schedule. Null when the results contradict each other or the schedule.
 */
export function buildContext(input: ClinchInput): Context | null {
  const teams = input.teams.map((t) => ({ ...t }))
  const byId = new Map(teams.map((t) => [t.rosterId, t]))
  const schedule = input.schedule.slice()
  const medianWinners = Math.floor(teams.length / 2)
  const median: MedianWeek[] = input.medianGame
    ? input.weeks.map((week) => ({
        week,
        capacity: medianWinners,
        eligible: new Set(teams.map((t) => t.rosterId)),
      }))
    : []
  for (const r of input.fixed ?? []) {
    if (r.kind === 'game') {
      const i = schedule.findIndex(
        (g) =>
          g.week === r.week &&
          ((g.home === r.winner && g.away === r.loser) ||
            (g.home === r.loser && g.away === r.winner)),
      )
      const w = byId.get(r.winner)
      const l = byId.get(r.loser)
      if (i < 0 || !w || !l) return null
      schedule.splice(i, 1)
      w.wins++
      l.losses++
    } else {
      const m = median.find((x) => x.week === r.week)
      const t = byId.get(r.rosterId)
      if (!m || !t || !m.eligible.has(r.rosterId)) return null
      m.eligible.delete(r.rosterId)
      if (r.won) {
        m.capacity--
        t.wins++
      } else {
        t.losses++
      }
      if (m.capacity < 0 || m.capacity > m.eligible.size) return null
    }
  }
  const gamesLeft = new Map<number, number>()
  for (const t of teams) gamesLeft.set(t.rosterId, 0)
  for (const m of median) {
    for (const id of m.eligible) gamesLeft.set(id, (gamesLeft.get(id) ?? 0) + 1)
  }
  for (const g of schedule) {
    gamesLeft.set(g.home, (gamesLeft.get(g.home) ?? 0) + 1)
    gamesLeft.set(g.away, (gamesLeft.get(g.away) ?? 0) + 1)
  }
  return { teams, schedule, median, gamesLeft }
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
  const weeks = ctx.median
    .map((m) => ({ m, teams: needy.filter((id) => m.eligible.has(id)) }))
    .filter((w) => w.m.capacity > 0 && w.teams.length > 0)
  const source = 0
  const sink = 1
  const teamNode = new Map<number, number>()
  let n = 2
  for (const id of needy) teamNode.set(id, n++)
  const flow = new Flow(n + games.length + weeks.length)
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
  weeks.forEach((w, i) => {
    const node = n + games.length + i
    flow.add(source, node, Math.min(w.teams.length, w.m.capacity))
    for (const id of w.teams) flow.add(node, teamNode.get(id) as number, 1)
  })
  return flow.maxFlow(source, sink) === required
}

/**
 * Can every team in `capped` finish with at most `limit` points while the
 * remaining games are played out? Games between two capped teams must hand
 * a win to one of them, and each week the median wins the other teams cannot
 * absorb have to land on capped teams.
 */
function canAllStayUnder(ctx: Context, capped: readonly number[], limit: number): boolean {
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
  const weeks = ctx.median
    .map((m) => {
      const teams = [...m.eligible].filter((id) => room.has(id))
      return { teams, forced: Math.max(0, m.capacity - (m.eligible.size - teams.length)) }
    })
    .filter((w) => w.forced > 0)
  const required = games.length + weeks.reduce((sum, w) => sum + w.forced, 0)
  if (required === 0) return true
  const source = 0
  const sink = 1
  const teamNode = new Map<number, number>()
  let n = 2
  for (const id of capped) teamNode.set(id, n++)
  const flow = new Flow(n + games.length + weeks.length)
  for (const [id, r] of room) flow.add(teamNode.get(id) as number, sink, r)
  games.forEach((g, i) => {
    const node = n + i
    flow.add(source, node, 1)
    flow.add(node, teamNode.get(g.home) as number, 1)
    flow.add(node, teamNode.get(g.away) as number, 1)
  })
  weeks.forEach((w, i) => {
    const node = n + games.length + i
    flow.add(source, node, w.forced)
    for (const id of w.teams) flow.add(node, teamNode.get(id) as number, 1)
  })
  return flow.maxFlow(source, sink) === required
}

/** True when `spots` other teams can all finish with at least the team's current points. */
export function hasClinched(ctx: Context, team: RecordInput, spots: number): boolean {
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
export function isEliminated(ctx: Context, team: RecordInput, spots: number): boolean {
  const best = points(team) + 2 * (ctx.gamesLeft.get(team.rosterId) ?? 0)
  const others = ctx.teams.filter((t) => t.rosterId !== team.rosterId)
  const above = others.filter((t) => points(t) > best)
  if (above.length >= spots) return true
  const rest = others.filter((t) => points(t) <= best)
  const free = spots - 1 - above.length // more teams allowed to finish above
  if (free >= rest.length) return false
  for (const uncapped of combinations(rest, free)) {
    const skip = new Set(uncapped.map((t) => t.rosterId))
    const capped = rest.filter((t) => !skip.has(t.rosterId)).map((t) => t.rosterId)
    if (canAllStayUnder(ctx, capped, best)) return false
  }
  return true
}

export function clinchStatuses(input: ClinchInput): ClinchStatus[] {
  const ctx = buildContext(input)
  if (!ctx) throw new Error('The fixed results do not fit the remaining schedule.')
  const { gamesLeft } = ctx
  const spots = Math.min(input.spots, input.teams.length)
  return ctx.teams.map((team) => {
    const remaining = gamesLeft.get(team.rosterId) ?? 0
    const others = ctx.teams.filter((t) => t.rosterId !== team.rosterId)
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
