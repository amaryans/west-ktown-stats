/**
 * Clinching scenarios for one week: for each team, the smallest sets of that
 * week's results that clinch a playoff spot (or a bye), or end its season,
 * whatever happens afterwards. Built on the exact checks in `clinch.ts`, so
 * the same rules apply: wins alone count, and a tie on wins is never enough
 * to clinch (points for cannot be known in advance) nor to be eliminated.
 *
 * Clinching is monotone (a team's own wins and its rivals' losses can only
 * help), so the scenarios are the minimal sets of helpful results that
 * guarantee it, found smallest first. Any full week of results that contains
 * one of them clinches; any that contains none does not.
 */
import {
  buildContext,
  hasClinched,
  isEliminated,
  points,
  type ClinchInput,
  type Context,
  type WeekResult,
} from './clinch.ts'
import { forecastKey } from './forecast.ts'
import { mulberry32, normal } from './rng.ts'
import type { RecordInput, ScheduledGame } from './types.ts'

export type ScenarioGoal = 'playoffs' | 'bye' | 'eliminated'

export interface TeamScenarios {
  rosterId: number
  goal: ScenarioGoal
  /** Any one of these, each a set of results that must all happen. */
  scenarios: WeekResult[][]
  /** False when the search stopped early and more (longer) scenarios may exist. */
  complete: boolean
}

export interface ScenarioInput extends ClinchInput {
  /** The week whose results the scenarios are written in (normally the next one). */
  week: number
  /** Most checks per team and goal before giving up on longer scenarios. */
  budget?: number
}

const GOALS: ScenarioGoal[] = ['playoffs', 'bye', 'eliminated']

/** Scenarios for every team and goal still open this week; empty lists are left out. */
export function clinchScenarios(input: ScenarioInput): TeamScenarios[] {
  const base = buildContext(input)
  if (!base) throw new Error('The fixed results do not fit the remaining schedule.')
  const spots = Math.min(input.spots, input.teams.length)
  const byes = Math.min(input.byes, spots)
  const budget = input.budget ?? 5000
  const out: TeamScenarios[] = []
  for (const team of base.teams) {
    const clinched = hasClinched(base, team, spots)
    const eliminated = !clinched && isEliminated(base, team, spots)
    if (eliminated) continue
    for (const goal of GOALS) {
      if (goal === 'playoffs' && clinched) continue
      if (goal === 'bye' && (byes === 0 || hasClinched(base, team, byes))) continue
      if (goal === 'eliminated' && clinched) continue
      const reached = (fixed: readonly WeekResult[]): boolean => {
        const ctx = buildContext({ ...input, fixed: [...(input.fixed ?? []), ...fixed] })
        if (!ctx) return false
        return check(ctx, goal, team.rosterId, goal === 'bye' ? byes : spots)
      }
      // Cheap bound first: the best this week could possibly go for the goal.
      if (
        !check(
          extremeWeek(base, input.week, team.rosterId, goal),
          goal,
          team.rosterId,
          goal === 'bye' ? byes : spots,
        )
      )
        continue
      const literals = helpfulResults(base, input.week, team, goal)
      const found = minimalSets(literals, reached, budget)
      if (found.sets.length > 0) {
        out.push({
          rosterId: team.rosterId,
          goal,
          scenarios: found.sets,
          complete: found.complete,
        })
      }
    }
  }
  return out
}

function check(ctx: Context, goal: ScenarioGoal, rosterId: number, spots: number): boolean {
  const team = ctx.teams.find((t) => t.rosterId === rosterId)
  if (!team) return false
  return goal === 'eliminated' ? isEliminated(ctx, team, spots) : hasClinched(ctx, team, spots)
}

/**
 * The week played out as well as possible for the goal, ignoring that two
 * rivals cannot both lose (or both win) their game with each other: every
 * other team loses everything (clinching) or wins everything (elimination).
 * If even this does not reach the goal, no real result will.
 */
function extremeWeek(base: Context, week: number, rosterId: number, goal: ScenarioGoal): Context {
  const good = goal !== 'eliminated'
  const played = new Map<number, { wins: number; losses: number }>()
  const tally = (id: number, won: boolean) => {
    const r = played.get(id) ?? { wins: 0, losses: 0 }
    if (won) r.wins++
    else r.losses++
    played.set(id, r)
  }
  for (const g of base.schedule) {
    if (g.week !== week) continue
    for (const id of [g.home, g.away]) tally(id, id === rosterId ? good : !good)
  }
  const median = base.median.find((m) => m.week === week)
  for (const id of median?.eligible ?? []) tally(id, id === rosterId ? good : !good)
  const teams: RecordInput[] = base.teams.map((t) => {
    const r = played.get(t.rosterId)
    return r ? { ...t, wins: t.wins + r.wins, losses: t.losses + r.losses } : t
  })
  const schedule = base.schedule.filter((g) => g.week !== week)
  const rest = base.median.filter((m) => m.week !== week)
  const gamesLeft = new Map<number, number>()
  for (const t of teams) gamesLeft.set(t.rosterId, 0)
  for (const m of rest) for (const id of m.eligible) gamesLeft.set(id, (gamesLeft.get(id) ?? 0) + 1)
  for (const g of schedule) {
    gamesLeft.set(g.home, (gamesLeft.get(g.home) ?? 0) + 1)
    gamesLeft.set(g.away, (gamesLeft.get(g.away) ?? 0) + 1)
  }
  return { teams, schedule, median: rest, gamesLeft }
}

/**
 * This week's results that move a team toward the goal: its own wins and
 * rivals' losses for clinching, the reverse for elimination. Only rivals who
 * can still finish level with or above the team matter.
 */
function helpfulResults(
  base: Context,
  week: number,
  team: RecordInput,
  goal: ScenarioGoal,
): WeekResult[] {
  const good = goal !== 'eliminated'
  const left = (id: number) => base.gamesLeft.get(id) ?? 0
  const low = points(team)
  const high = low + 2 * left(team.rosterId)
  const rivals = new Set(
    base.teams
      .filter(
        (t) =>
          t.rosterId !== team.rosterId &&
          points(t) <= high &&
          points(t) + 2 * left(t.rosterId) >= low,
      )
      .map((t) => t.rosterId),
  )
  const own: WeekResult[] = []
  const others: WeekResult[] = []
  const games = base.schedule.filter((g) => g.week === week)
  const median = base.median.find((m) => m.week === week)
  for (const g of games) {
    for (const [id, opp] of [
      [g.home, g.away],
      [g.away, g.home],
    ] as const) {
      if (id === team.rosterId) {
        own.push(good ? win(week, id, opp) : win(week, opp, id))
      } else if (rivals.has(id) && opp !== team.rosterId) {
        others.push(good ? win(week, opp, id) : win(week, id, opp))
      }
    }
  }
  if (median?.eligible.has(team.rosterId)) {
    own.push({ kind: 'median', week, rosterId: team.rosterId, won: good })
  }
  for (const id of rivals) {
    if (median?.eligible.has(id)) others.push({ kind: 'median', week, rosterId: id, won: !good })
  }
  return [...own, ...others]
}

function win(week: number, winner: number, loser: number): WeekResult {
  return { kind: 'game', week, winner, loser }
}

function sameGame(a: WeekResult, b: WeekResult): boolean {
  return (
    a.kind === 'game' &&
    b.kind === 'game' &&
    a.week === b.week &&
    ((a.winner === b.winner && a.loser === b.loser) ||
      (a.winner === b.loser && a.loser === b.winner))
  )
}

/**
 * Minimal subsets of `literals` for which `holds` is true, smallest first.
 * Supersets of a found set are skipped, as are sets with both sides of one
 * game. Stops after `budget` checks.
 */
function minimalSets(
  literals: readonly WeekResult[],
  holds: (set: readonly WeekResult[]) => boolean,
  budget: number,
): { sets: WeekResult[][]; complete: boolean } {
  const found: number[][] = []
  let checks = 0
  for (let k = 0; k <= literals.length; k++) {
    let any = false
    for (const idx of indexCombinations(literals.length, k)) {
      if (found.some((f) => f.every((i) => idx.includes(i)))) continue
      const set = idx.map((i) => literals[i] as WeekResult)
      if (set.some((a, i) => set.some((b, j) => j > i && sameGame(a, b)))) continue
      any = true
      if (checks >= budget) {
        return { sets: found.map((f) => f.map((i) => literals[i] as WeekResult)), complete: false }
      }
      checks++
      if (holds(set)) found.push(idx)
    }
    if (!any) break
  }
  return { sets: found.map((f) => f.map((i) => literals[i] as WeekResult)), complete: true }
}

function* indexCombinations(n: number, k: number, start = 0): Generator<number[]> {
  if (k === 0) {
    yield []
    return
  }
  for (let i = start; i <= n - k; i++) {
    for (const rest of indexCombinations(n, k - 1, i + 1)) yield [i, ...rest]
  }
}

/** A stable string for a result, for set lookups. */
export function resultKey(r: WeekResult): string {
  return r.kind === 'game'
    ? `g${r.week}:${r.winner}>${r.loser}`
    : `m${r.week}:${r.rosterId}:${r.won ? 'w' : 'l'}`
}

export interface ChanceInput {
  week: number
  rosterIds: readonly number[]
  schedule: readonly ScheduledGame[]
  medianGame: boolean
  /** Keyed by forecastKey(rosterId, week). */
  forecasts: Record<string, { mean: number; sd: number }>
  runs: number
  seed: number
}

/**
 * The chance each entry's goal is reached this week: the week's scores are
 * drawn from the forecasts (as in the season simulation) and an entry counts
 * when one of its scenarios happened. A lower bound when the entry is not complete.
 */
export function scenarioChances(entries: readonly TeamScenarios[], input: ChanceInput): number[] {
  const random = mulberry32(input.seed)
  const games = input.schedule.filter((g) => g.week === input.week)
  const sets = entries.map((e) => e.scenarios.map((s) => s.map(resultKey)))
  const hits = new Array<number>(entries.length).fill(0)
  const runs = Math.max(1, Math.floor(input.runs))
  for (let run = 0; run < runs; run++) {
    const score = new Map<number, number>()
    for (const id of input.rosterIds) {
      const f = input.forecasts[forecastKey(id, input.week)] ?? { mean: 0, sd: 0 }
      score.set(id, Math.max(0, f.sd > 0 ? f.mean + f.sd * normal(random) : f.mean))
    }
    const happened = new Set<string>()
    for (const g of games) {
      const h = score.get(g.home) ?? 0
      const a = score.get(g.away) ?? 0
      if (h > a) happened.add(resultKey(win(input.week, g.home, g.away)))
      else if (a > h) happened.add(resultKey(win(input.week, g.away, g.home)))
    }
    if (input.medianGame && score.size > 1) {
      const sorted = [...score.values()].sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      const med =
        sorted.length % 2 === 1
          ? (sorted[mid] as number)
          : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
      for (const [id, s] of score) {
        if (s !== med) {
          happened.add(resultKey({ kind: 'median', week: input.week, rosterId: id, won: s > med }))
        }
      }
    }
    sets.forEach((options, i) => {
      if (options.some((keys) => keys.every((k) => happened.has(k))))
        hits[i] = (hits[i] as number) + 1
    })
  }
  return hits.map((h) => h / runs)
}
