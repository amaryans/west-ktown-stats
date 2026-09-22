/**
 * Monte Carlo season simulation. Every unplayed week each team's score is a
 * normal draw around its forecast; head-to-head games (and the league-median
 * game when the league plays one) resolve from those draws. Seeding is wins,
 * then points for — this league's tiebreaker. Seeded, so results replay.
 */
import { forecastKey } from './forecast.ts'
import { mulberry32, normal, normalCdf } from './rng.ts'
import type { SimulationInput, SimulationResult, TeamOdds } from './types.ts'

/** First-round byes for a bracket of `playoffTeams`: the gap up to the next power of two. */
export function byeCount(playoffTeams: number): number {
  if (playoffTeams <= 1) return 0
  let size = 1
  while (size < playoffTeams) size *= 2
  return size - playoffTeams
}

interface SimTeam {
  rosterId: number
  wins: number
  losses: number
  ties: number
  pointsFor: number
}

function seedOrder(teams: SimTeam[]): SimTeam[] {
  return teams.slice().sort((a, b) => {
    const pa = winPct(a)
    const pb = winPct(b)
    if (pb !== pa) return pb - pa
    if (b.wins !== a.wins) return b.wins - a.wins
    return b.pointsFor - a.pointsFor
  })
}

function winPct(t: SimTeam): number {
  const games = t.wins + t.losses + t.ties
  return games === 0 ? 0 : (t.wins + t.ties / 2) / games
}

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b)
  const n = sorted.length
  const mid = Math.floor(n / 2)
  return n % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
}

export function simulateSeason(input: SimulationInput): SimulationResult {
  const random = mulberry32(input.seed)
  const teamCount = input.teams.length
  const playoffTeams = Math.min(input.playoffTeams, teamCount)
  const byes = byeCount(playoffTeams)
  const index = new Map(input.teams.map((t, i) => [t.rosterId, i]))
  const gamesByWeek = new Map<number, { home: number; away: number }[]>()
  for (const g of input.schedule) {
    const hi = index.get(g.home)
    const ai = index.get(g.away)
    if (hi === undefined || ai === undefined) continue
    if (!gamesByWeek.has(g.week)) gamesByWeek.set(g.week, [])
    gamesByWeek.get(g.week)?.push({ home: hi, away: ai })
  }
  const weeks = input.weeks.slice().sort((a, b) => a - b)
  const forecast = weeks.map((week) =>
    input.teams.map((t) => input.forecasts[forecastKey(t.rosterId, week)] ?? { mean: 0, sd: 0 }),
  )

  const playoffCount = new Array<number>(teamCount).fill(0)
  const byeCountBy = new Array<number>(teamCount).fill(0)
  const seedCount = input.teams.map(() => new Array<number>(teamCount).fill(0))
  const winsSum = new Array<number>(teamCount).fill(0)
  const lossesSum = new Array<number>(teamCount).fill(0)
  const tiesSum = new Array<number>(teamCount).fill(0)
  const pointsSum = new Array<number>(teamCount).fill(0)

  const runs = Math.max(1, Math.floor(input.runs))
  const scores = new Array<number>(teamCount).fill(0)
  for (let run = 0; run < runs; run++) {
    const teams: SimTeam[] = input.teams.map((t) => ({ ...t }))
    weeks.forEach((week, wi) => {
      const fc = forecast[wi] ?? []
      for (let i = 0; i < teamCount; i++) {
        const f = fc[i] ?? { mean: 0, sd: 0 }
        const draw = f.sd > 0 ? f.mean + f.sd * normal(random) : f.mean
        scores[i] = Math.max(0, Math.round(draw * 100) / 100)
        const team = teams[i] as SimTeam
        team.pointsFor += scores[i] as number
      }
      for (const g of gamesByWeek.get(week) ?? []) {
        const h = teams[g.home] as SimTeam
        const a = teams[g.away] as SimTeam
        const hs = scores[g.home] as number
        const as = scores[g.away] as number
        if (hs > as) {
          h.wins++
          a.losses++
        } else if (as > hs) {
          a.wins++
          h.losses++
        } else {
          h.ties++
          a.ties++
        }
      }
      if (input.medianGame && teamCount > 1) {
        const med = median(scores)
        for (let i = 0; i < teamCount; i++) {
          const team = teams[i] as SimTeam
          const s = scores[i] as number
          if (s > med) team.wins++
          else if (s < med) team.losses++
          else team.ties++
        }
      }
    })
    const order = seedOrder(teams)
    order.forEach((team, seed) => {
      const i = index.get(team.rosterId) as number
      ;(seedCount[i] as number[])[seed] = ((seedCount[i] as number[])[seed] as number) + 1
      if (seed < playoffTeams) playoffCount[i] = (playoffCount[i] as number) + 1
      if (seed < byes) byeCountBy[i] = (byeCountBy[i] as number) + 1
      winsSum[i] = (winsSum[i] as number) + team.wins
      lossesSum[i] = (lossesSum[i] as number) + team.losses
      tiesSum[i] = (tiesSum[i] as number) + team.ties
      pointsSum[i] = (pointsSum[i] as number) + team.pointsFor
    })
  }

  const teams: TeamOdds[] = input.teams.map((t, i) => {
    const dist = (seedCount[i] as number[]).map((c) => c / runs)
    return {
      rosterId: t.rosterId,
      playoff: (playoffCount[i] as number) / runs,
      bye: (byeCountBy[i] as number) / runs,
      seedDistribution: dist,
      averageSeed: dist.reduce((sum, p, seed) => sum + p * (seed + 1), 0),
      topSeed: dist[0] ?? 0,
      projectedWins: (winsSum[i] as number) / runs,
      projectedLosses: (lossesSum[i] as number) / runs,
      projectedTies: (tiesSum[i] as number) / runs,
      projectedPointsFor: (pointsSum[i] as number) / runs,
    }
  })
  return { runs, seed: input.seed, playoffTeams, byes, teams }
}

/** Probability the first team outscores the second when both are normal draws. */
export function winProbability(
  a: { mean: number; sd: number },
  b: { mean: number; sd: number },
): number {
  const sd = Math.sqrt(a.sd * a.sd + b.sd * b.sd)
  if (sd === 0) return a.mean > b.mean ? 1 : a.mean < b.mean ? 0 : 0.5
  return normalCdf((a.mean - b.mean) / sd)
}
